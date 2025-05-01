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

const char* ssid = "Meow ~"; //change to the wifi your laptop is using
const char* password = "nhaconuoimeo"; //same as above
const char* serverHost = "192.168.1.20"; // Backend host - CHANGE TO MATCH YOUR CURRENT IP
const int serverPort = 3000; // Backend port
const char* serverPath = "/history"; // Backend path

// Static IP config
IPAddress local_IP(192, 168, 1, 220);
IPAddress gateway(192, 168, 1, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress primaryDNS(8, 8, 8, 8);
IPAddress secondaryDNS(8, 8, 4, 4);

// Pin - change if needed
#define RELAY_PIN 23
#define SOIL_MOISTURE_PIN 34 
#define DHTPIN 4 
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);
int plantID = 1; // Default plantID (updated via /control)

// Global variables for thresholds and pump state
int lowerThreshold = 30;
int upperThreshold = 70; 
bool isPumpOn = false; 

RTC_DS3231 rtc; //object

const unsigned long INTERVAL = 60000; //data collection interval, can be changed

//SPIFFS file to store data
const char* DATA_FILE = "/data.json";
const size_t MAX_FILE_SIZE = 10*1024; //10 kB, can be adjusted

AsyncWebServer server(80);

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

//reader
float readSoilMois(){
    int soil = analogRead(SOIL_MOISTURE_PIN);
    float soilPercentage = map(soil, 0, 4095, 100,0);
    if (soilPercentage < 0 ) soilPercentage = 0;
    if (soilPercentage > 100) soilPercentage = 100;
    return soilPercentage;
}

bool getTime(String &date, String &time) {
    DateTime now = rtc.now();
     if(!now.isValid()){
        Serial.println("failed to obtain time from DS3231");
        return false;
     }
     //FORMAT AS DD/MM/YYYY
     char dateStr[11];
     snprintf(dateStr, sizeof(dateStr),"%02d/%02d/%04d", now.day(),now.month(), now.year());
     date = String(dateStr);
     //FORMAT AS HH:MM:SS
     char timeStr[9];
     snprintf(timeStr, sizeof(timeStr),"%02d:%02d:%02d", now.hour(), now.minute(),now.second());
     time = String(timeStr);
     return true;
}

//save data - experimental
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
    while (1); // Halt if RTC not found
    }

    if (rtc.lostPower()) {
    Serial.println("RTC lost power, setting default time...");
    rtc.adjust(DateTime(2025, 1, 1, 0, 0, 0)); // Set to a default time
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
            Serial.println("Pump turned ON (Manual)");
        } else if (strcmp(pumpState, "off") == 0) {
            digitalWrite(RELAY_PIN, LOW);
            isPumpOn = false;
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

    if(current - lastCollection >= INTERVAL){
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    float soilMoisture = readSoilMois();

    if (isnan(temperature) || isnan(humidity)) {
        Serial.println("Failed to read from DHT sensor!");
        temperature = 0.0; // Fallback value
        humidity = 0.0;
        //implement 'if fail to read, continue to read' later
    }

    String date, time;
    if (!getTime(date, time)) {
        Serial.println("Failed to read from DS3231");
        date = "19/04/2025"; // Fallback value
        time = "10:33:25";
        //implement 'if fail to read, continue to read' later
    }

    if (soilMoisture < lowerThreshold && !isPumpOn) {
        digitalWrite(RELAY_PIN, HIGH);
        isPumpOn = true;
        Serial.println("Pump turned ON (Automatic): Soil moisture (" + String(soilMoisture) + ") below lower threshold (" + String(lowerThreshold) + ")");
    } 
    else if (soilMoisture > (upperThreshold - 5) && isPumpOn) {
        digitalWrite(RELAY_PIN, LOW);
        isPumpOn = false;
        Serial.println("Pump turned OFF (Automatic): Soil moisture (" + String(soilMoisture) + ") above upper threshold (" + String(upperThreshold) + ")");
    }

     String payload = "{\"plantID\": \"" + String(plantID) + "\", " +
                         "\"soilMoisture\": " + String(soilMoisture, 2) + ", " +
                         "\"temperature\": " + String(temperature, 2) + ", " +
                         "\"airMoisture\": " + String(humidity, 2) + ", " +
                         "\"date\": \"" + date + "\", " +
                         "\"time\": \"" + time + "\"}";

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
        lastCollection = current; 
    } 
    delay(100); //avoid tight loop
}