CREATE database watering_system;
use watering_system;

CREATE TABLE plant (
    plantID INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    info TEXT,
    lowerThreshold FLOAT(5,2),
    upperThreshold FLOAT(5,2)
);

CREATE TABLE history (
    timeID INT AUTO_INCREMENT PRIMARY KEY,
    plantID INT NOT NULL,
    soilMoisture FLOAT(5,2) NOT NULL,
    temperature FLOAT(5,2) NOT NULL,
    recorded DATETIME,
    FOREIGN KEY (plantID) REFERENCES plant(plantID)
);
ALTER TABLE history ADD airMoisture FLOAT(5,2) NOT NULL;

SELECT * FROM history;