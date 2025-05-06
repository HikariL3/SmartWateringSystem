//BEFORE RUNNING
//Make sure you have necessary library installed for below code to run
/*
- RTClib by Adafruit
- ESPAsyncWebSrv by dvarrel / or ESPAsyncWebServer by lacamera (need testing)
- Async TCP by ESP32 Async
- DHT sensor library by Adafruit
- AwslotWiFiClient by Danila....
- Adafruit BusIO by Adadruit
- Adafruit GFX Library
- Adafruit Unified Sensor
- AdafruitJson by Benoit 

Chắc là thế, nhưng mà nếu như không được thì cài thêm mấy cái này, từng cái một, nếu được thì không cần cài thêm. 
- Arduino Uno WiFi Dev Ed Library by Arduino 
- ESPAsyncTCP by dvarrel
- Adafruit SSD1306
*/
//IMPORTANT - go to board manager -> INSTALLED esp32 by Espressif -> VERSION 3.0.7 - NEWER VERSION WILL GET tcp_alloc ERROR

#include <WiFi.h>
#include <ESPAsyncWebSrv.h>
#include <SPIFFS.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <RTClib.h>

const char* ssid = "Meow ~"; //change to the wifi your laptop is using - 2.4GHz only
const char* password = "nhaconuoimeo"; //same as above
const char* serverHost = "192.168.1.72"; // Backend host - CHANGE TO MATCH YOUR CURRENT IP
const int serverPort = 3000; // Backend port
const char* serverPath = "/history"; // Backend path

// Static IP config
IPAddress local_IP(192, 168, 1, 220);
IPAddress gateway(192, 168, 1, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress primaryDNS(8, 8, 8, 8);
IPAddress secondaryDNS(8, 8, 4, 4);

// Pin - change if needed
#define RELAY_PIN 17
#define SOIL_MOISTURE_PIN 34 
#define DHTPIN 23
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// Global variables 
// - For data
float temperature = 0.0;
float humidity = 0.0;
float soilMoisture = 0.0;
String date = "2025/05/03"; 
String time0 = "12:39:40";

// - For controlling
//with RTC_DATA_ATTR is to save data in RTC memory instead of SRAM, preventing data loss after deep sleep
RTC_DATA_ATTR int plantID = 1; // Default (updated via /control)
RTC_DATA_ATTR int lowerThreshold = 30;
RTC_DATA_ATTR int upperThreshold = 60; 
bool isPumpOn = false; 
bool isManualMode = false;
unsigned long pumpTimer = 0; //timer for pump - limiting watering time

const unsigned long INTERVAL = 15000; //data collection interval, can be changed
const unsigned long CHECK_INTERVAL = 2000; //for continuous check while pump is on 
const unsigned long PUMP_DURATION = 10000; //max duration for pump on in manual mode

//SPIFFS to store data
const char* DATA_FILE = "/data.json";
const size_t MAX_FILE_SIZE = 10*1024; //10 kB, can be adjusted

const uint64_t DEEP_SLEEP_DURATION = 1 * 3600 * 1000000ULL; // 1 hour in microsec
bool isDSMode = false; //Deep Sleep Mode
AsyncWebServer server(80);
RTC_DS3231 rtc; //object

bool waitForNetwork(uint8_t retries = 10) {
    uint8_t attempt = 0;
    while (WiFi.status() != WL_CONNECTED && attempt < retries) {
        Serial.print("Connecting to WiFi (Attempt ");
        Serial.print(attempt + 1);
        Serial.println(")...");
        delay(1000);
        attempt++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("Connected to WiFi");
        Serial.print("IP Address: ");
        Serial.println(WiFi.localIP());
        return true;
    }

    Serial.println("WiFi connection failed after retries");
    return false;
}

//deep sleep implementation
void IRAM_ATTR onAlarm() {
    //empty
}

void setDSAlarm(){
    rtc.disable32K(); //we dont use this
    rtc.writeSqwPinMode(DS3231_OFF);

    //clear existing alarms
    rtc.clearAlarm(1);
    rtc.clearAlarm(2);
    rtc.disableAlarm(2);

    //set alarm 1 to trigger at 00:00:00 everyday
    DateTime now = rtc.now();
    DateTime alarmTime = DateTime(now.year(), now.month(), now.day(), 0, 0, 0);
    if (now.hour() >= 0 && now.hour < 5) {
        //intended deep sleep time, enter deep sleep (if run at compile time)
        isDSMode = true;
    } else {
        if (now.hour() >= 5){
            alarmTime = alarmTime + TimeSpan(1, 0, 0, 0); //next day
        }
    }
    if (!rtc.setAlarm1(alarmTime, DS3231_A1_Hour)) {
        Serial.println("Error setting daily alarm");
    } else {
        Serial.println("Daily alarm set for 00:00:00");
    }

    //configure SQW pin for interrupt
    pinMode(CLOCK_INTERRUPT_PIN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(CLOCK_INTERRUPT_PIN), onAlarm, FALLING);
}

void enterDeepSleep() {
    Serial.println("Entering deep sleep for 1 hour...");
    esp_sleep_enable_ext0_wakeup(CLOCK_INTERRUPT_PIN, 0); // wake on LOW (SQW is active LOW)
    esp_sleep_enable_timer_wakeup(DEEP_SLEEP_DURATION); // fallback timer 
    esp_deep_sleep_start();
}

//reader
float readSoilMois(){
    int soil = analogRead(SOIL_MOISTURE_PIN);
    float soilPercentage = map(soil, 0, 4095, 100,0);
    if (soilPercentage < 0 ) soilPercentage = 0;
    if (soilPercentage > 100) soilPercentage = 100;
    return soilPercentage;
}

bool getTime(String &date, String &time0) {
    DateTime now = rtc.now();
     if(!now.isValid()){
        Serial.println("failed to obtain time from DS3231");
        return false;
     }
     //FORMAT AS YYYY-MM-DD
     char dateStr[11];
     snprintf(dateStr, sizeof(dateStr),"%04d-%02d-%02d", now.year(),now.month(), now.day());
     date = String(dateStr);
     //FORMAT AS HH:MM:SS
     char timeStr[9];
     snprintf(timeStr, sizeof(timeStr),"%02d:%02d:%02d", now.hour(), now.minute(),now.second());
     time0 = String(timeStr);
     return true;
}

void collectData(){
    temperature = dht.readTemperature();
    humidity = dht.readHumidity();
    soilMoisture = readSoilMois();

    if (isnan(temperature) || isnan(humidity)) {
        Serial.println("Failed to read from DHT sensor!");
        temperature = 0.0; // Fallback value
        humidity = 0.0;
        //implement 'if fail to read, notify user by email' 
    }
    if (!getTime(date, time0)) {
        Serial.println("Failed to read from DS3231");
        date = "2025/05/03"; // Fallback value
        time0 = "12:39:40";
        //implement 'if fail to read, notify user by email'
    }
}

void controlAutomatic(){
    if (isManualMode) return;
    soilMoisture = readSoilMois();
    if (soilMoisture < lowerThreshold && !isPumpOn) {
        digitalWrite(RELAY_PIN, HIGH);
        isPumpOn = true;
        Serial.println("Pump turned ON (Automatic): Soil moisture (" + String(soilMoisture) + ") below lower threshold (" + String(lowerThreshold) + ")");
    } 
    else if (soilMoisture > (upperThreshold - 5) && isPumpOn) {
        digitalWrite(RELAY_PIN, LOW);
        isPumpOn = false;
        collectData();
        processData();
        Serial.println("Pump turned OFF (Automatic): Soil moisture (" + String(soilMoisture) + ") above upper threshold (" + String(upperThreshold) + ")");
    }
}

void controlManual(){
    static unsigned long lastCheck = 0; 
    unsigned long current = millis();
    if(current - lastCheck < CHECK_INTERVAL) return;
    lastCheck = current;
    collectData();

    String payload = "{\"plantID\": \"" + String(plantID) + "\", " +
                         "\"soilMoisture\": " + String(soilMoisture, 2) + ", " +
                         "\"temperature\": " + String(temperature, 2) + ", " +
                         "\"airMoisture\": " + String(humidity, 2) + ", " +
                         "\"date\": \"" + date + "\", " +
                         "\"time\": \"" + time0 + "\"}";

    if (WiFi.status() == WL_CONNECTED) {
        if (sendData(payload)) {
            Serial.println("Manual mode: Data sent to server");
        } 
    }
    if (isManualMode && (current - pumpTimer > PUMP_DURATION )) {
        digitalWrite(RELAY_PIN, LOW);
        isPumpOn = false;
        isManualMode = false;
        Serial.println("Pump turned OFF (Manual): Max duration reached.");
    }
}

//data processing
void processData(){
    String payload = "{\"plantID\": \"" + String(plantID) + "\", " +
                         "\"soilMoisture\": " + String(soilMoisture, 2) + ", " +
                         "\"temperature\": " + String(temperature, 2) + ", " +
                         "\"airMoisture\": " + String(humidity, 2) + ", " +
                         "\"date\": \"" + date + "\", " +
                         "\"time\": \"" + time0 + "\"}";

    if (WiFi.status() == WL_CONNECTED) {
        if(sendData(payload)){
        Serial.println("Data sent successfully");
        sendSaved();
        } else {
            Serial.println("failed to connect to server, saving data...");
            saveData(payload);
        } 
    } else {
        Serial.println("WiFi disconnected, reconnecting...");
        WiFi.reconnect();
        if (waitForNetwork(15)) {
            Serial.println("Reconnected to WiFi");
            Serial.print("IP Address: ");
            Serial.println(WiFi.localIP());
            if(sendData(payload)){
                Serial.println("Data sent successfully");
                sendSaved();
            } else {
        Serial.println("Failed to connect to server after reconnect, saving data...");
        saveData(payload);
            }
        } else {
        Serial.println("Failed to reconnect to WiFi, saving data...");
        saveData(payload);
        }
    }
}

//saving data using SPIFFS
void saveData(const String& payload){
    File file = SPIFFS.open(DATA_FILE, FILE_APPEND);
    if(!file){
        Serial.println("Failed to open file for appending");
        return; 
    }
    //check file's size
    size_t fileSize = file.size();
     if(fileSize + payload.length() > MAX_FILE_SIZE){
        Serial.println("File size exceeds limit, deleting oldest entries...");
        file.close();
        //read entries
        File readFile = SPIFFS.open(DATA_FILE, FILE_READ);
        if(!readFile){
            Serial.println("Failed to open file for reading");
            return;
        }
        String allData = readFile.readString();
        readFile.close();
        //split into lines
        int newlineIndex = allData.indexOf('\n');
        if(newlineIndex == -1){
            Serial.println("No data to delete, overwriting file...");
            SPIFFS.remove(DATA_FILE);
            file = SPIFFS.open(DATA_FILE, FILE_WRITE);
        }
        else {
            //remove oldest entry / 1st line
            allData = allData.substring(newlineIndex + 1);
            SPIFFS.remove(DATA_FILE);
            file = SPIFFS.open(DATA_FILE, FILE_WRITE);
            file.print(allData);
        }
     }
     file.println(payload);
     file.close();
     Serial.println("Data saved to SPIFFS:" + payload);
}

bool sendData(const String& payload){
    WiFiClient client;
    if(!client.connect(serverHost, serverPort, 5000)){
        Serial.println("failed to connect to server");
        return false;
    }
    client.println(String("POST ") + serverPath + " HTTP/1.1");
    client.println(String("Host: ") + serverHost + ":" + serverPort);
    client.println("Content-Type: application/json");
    client.println(String("Content-Length: ") + payload.length());
    client.println();
    client.println(payload);

    unsigned long startTime = millis();
    while (client.connected() && millis() - startTime < 5000){
        if(client.available()){
            String line = client.readStringUntil('\n');
            Serial.println(line);
        }
    }
    client.stop();

    Serial.println("HTTP request sent successfully");
    return true;
}

void sendSaved(){
    File file = SPIFFS.open(DATA_FILE, FILE_READ);
    if(!file){
        Serial.println("No saved data to send");
        return;
    }

    while(file.available()){
        String line = file.readStringUntil('\n');
        line.trim();
        if(line.length() > 0){
            if(sendData(line)){
                Serial.println("Sent saved data: " + line);
            } else {
                Serial.println("failed to send saved data, keeping in SPIFFS: " + line);
                saveData(line);
                while(file.available()){
                    String remain = file.readStringUntil('\n');
                    remain.trim();
                    if(remain.length() > 0){
                        saveData(remain);
                    }
                }
                break;
            }
        }
    }
    file.close();
    File checkFile = SPIFFS.open(DATA_FILE, FILE_READ);
    if (!SPIFFS.exists(DATA_FILE) ||checkFile && checkFile.size() == 0){
        checkFile.close();
        return;
    }
    if (checkFile) checkFile.close();
    SPIFFS.remove(DATA_FILE);
    Serial.println("Cleared saved data from SPIFFS");
}

void setup() {
    Serial.begin(115200);

    // init pin
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, LOW); // Pump off 
    isPumpOn = false;

    // init DHT
    dht.begin();

    //init RTC and SPIFFS
    if (!SPIFFS.begin(true)) {
    Serial.println("An error occurred while mounting SPIFFS");
    ESP.restart();
    }

    if (!rtc.begin()) {
    Serial.println("Couldn't find DS3231 RTC");
    //while (1) delay (50); // Halt if RTC not found
    }

    if (rtc.lostPower()) {
    Serial.println("RTC lost power, setting time...");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }

    // Configure static IP
    if (!WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS)) {
        Serial.println("Failed to configure static IP");
    }

    // Connect to WiFi
    WiFi.begin(ssid, password);
    if (!waitForNetwork(15)) {
        Serial.println("Network setup failed, restarting...");
        ESP.restart();
    }

    setDSAlarm();

    // Add CORS headers 
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type");

    // Handle CORS preflight requests (OPTIONS) for all paths
    server.on(".*", HTTP_OPTIONS, [](AsyncWebServerRequest *request) {
        Serial.println("Received OPTIONS request for CORS preflight");
        request->send(200, "text/plain", "");
    });

    // Handle POST requests to /control (Automatic Mode configuration)
    server.on("/control", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("body", true)) {
            Serial.println("Error: No body parameter in /control request");
            request->send(400, "application/json", "{\"error\":\"Missing body parameter\"}");
            return;
        }

        String body = request->getParam("body", true)->value();
        Serial.println("Received /control request: " + body);

        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, body);
        if (error) {
            Serial.println("Error: Failed to parse JSON - " + String(error.c_str()));
            request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            return;
        }

        if (!doc.containsKey("plantID") || !doc.containsKey("lowerThreshold") || !doc.containsKey("upperThreshold")) {
            Serial.println("Error: Missing required fields in /control request");
            request->send(400, "application/json", "{\"error\":\"Missing required fields\"}");
            return;
        }

        plantID = doc["plantID"];
        lowerThreshold = doc["lowerThreshold"];
        upperThreshold = doc["upperThreshold"];

        Serial.print("Plant ID: ");
        Serial.println(plantID);
        Serial.print("Lower Threshold: ");
        Serial.println(lowerThreshold);
        Serial.print("Upper Threshold: ");
        Serial.println(upperThreshold);
        Serial.println("Automatic mode configured for Plant ID: " + String(plantID));

        request->send(200, "application/json", "{\"message\":\"Automatic mode configured\"}");
    });

    // Handle POST requests to /pump (Manual Mode - Forced Watering)
    server.on("/pump", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("body", true)) {
            Serial.println("Error: No body parameter in /pump request");
            request->send(400, "application/json", "{\"error\":\"Missing body parameter\"}");
            return;
        }

        String body = request->getParam("body", true)->value();
        Serial.println("Received /pump request: " + body);

        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, body);
        if (error) {
            Serial.println("Error: Failed to parse JSON - " + String(error.c_str()));
            request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            return;
        }

        if (!doc.containsKey("pumpState")) {
            Serial.println("Error: Missing pumpState field in /pump request");
            request->send(400, "application/json", "{\"error\":\"Missing pumpState field\"}");
            return;
        }

        const char* pumpState = doc["pumpState"];
        if (strcmp(pumpState, "on") == 0) {
            digitalWrite(RELAY_PIN, HIGH);
            isPumpOn = true;
            isManualMode = true;
            pumpTimer = millis();
            Serial.println("Pump turned ON (Manual)");
        } else if (strcmp(pumpState, "off") == 0) {
            digitalWrite(RELAY_PIN, LOW);
            isPumpOn = false;
            isManualMode = false;
            Serial.println("Pump turned OFF (Manual)");
        } else {
            Serial.println("Error: Invalid pump state - " + String(pumpState));
            request->send(400, "application/json", "{\"error\":\"Invalid pump state\"}");
            return;
        }

        request->send(200, "application/json", "{\"message\":\"Pump command executed\"}");
    });

    server.begin();
    Serial.println("Web server started");
}

void loop() {
    static unsigned long lastCollection = 0;
    unsigned long current = millis();

    if (!isPumpOn) {
        if (current - lastCollection >= INTERVAL) {
            collectData();
            controlAutomatic();
            processData(); // Send or save
            lastCollection = current;
        }
    } else {
        if (isManualMode) {
            controlManual(); // Includes sending
        } else {
            static unsigned long lastCheck = 0;
            if (current - lastCheck >= CHECK_INTERVAL) {
                lastCheck = current;
                controlAutomatic(); // no continuous sending
            }
        }
    }
     delay(100); //avoid tight loop
}

/* 
To-do list:
- Wire DS3231 and water level sensor 
- Check DS3231 and water level functionality (done with DS3231)
- While watering, continuously track soil moisture (no need to send data, send when pump is off) instead of waiting for the next record (kinda done)
- Warning when water is running low (email/pop-up)
- IMPLEMENT GRAPH DATA ON SERVER SIDE
- Add error handling for DHT22 and DS3231 instead of using fallback value
Further enhancement: (if time allows)
- Implement button responsiveness on server side (need clarification)
- Make a simple model
*/