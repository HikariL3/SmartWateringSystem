document.addEventListener('DOMContentLoaded', function () {
    const gaugeFill = document.querySelector('.gauge-fill');
    const gaugeValue = document.querySelector('.gauge-value');
    const plantSelect = document.getElementById('plant-select');
    const lowerThreshold = document.getElementById('lower-threshold');
    const upperThreshold = document.getElementById('upper-threshold');
    const plantInfo = document.getElementById('plant-info');
    const tempValue = document.querySelector('.temperature p:first-of-type'); 
    const airMoisValue = document.querySelector('.air-moisture'); 
    const sendData = document.getElementById('send-to-esp32'); 
    const pumpOnBtn = document.querySelector('.control-mode .buttons .on');
    const pumpOffBtn = document.querySelector('.control-mode .buttons .off');

    // Fetch plants from the backend and populate the dropdown
    let plants = [];

    async function fetchPlants() {
        try {
            const response = await fetch('http://localhost:3000/plants');
            if (!response.ok) {
                throw new Error('Failed to fetch plants');
            }
            plants = await response.json();
            // Populate the dropdown
            plantSelect.innerHTML = ''; // Clear existing options
            plants.forEach(plant => {
                const option = document.createElement('option');
                option.value = plant.plantID; // Use plantID as the value
                option.textContent = plant.Name;
                plantSelect.appendChild(option);
            });
            // Update the plant info for the initially selected plant
            updatePlantInfo(plantSelect.value);
            // Enable the Send to ESP32 button now that plants are loaded
            sendData.disabled = false;
        } catch (error) {
            console.error('Error fetching plants:', error);
            alert('Error fetching plants from the server');
        }
    }

    // Fetch the latest history entry to get data
    async function fetchHistory(plantID) {
        try {
            const response = await fetch(`http://localhost:3000/history/latest`);
            if (!response.ok) {
                throw new Error('Failed to fetch history');
            }
            const history = await response.json();
            // Return the most recent entry (first entry after sorting by date and time DESC)
            return history.length > 0 ? history[0] : null;
        } catch (error) {
            console.error('Error fetching history:', error);
            return null;
        }
    }

    async function updatePlantInfo(plantID) {
        const selectedPlant = plants.find(plant => plant.plantID == plantID);
        if (selectedPlant) {
            lowerThreshold.textContent = `${selectedPlant.lowerThreshold}%`;
            upperThreshold.textContent = `${selectedPlant.upperThreshold}%`;
            plantInfo.textContent = selectedPlant.info;

            const latestHistory = await fetchHistory();
            if (latestHistory) {
                gaugeValue.textContent = `${latestHistory.soilMoisture}%`;
                updateGauge(latestHistory.soilMoisture);
                tempValue.textContent = `${latestHistory.temperature}°C`;
                airMoisValue.textContent = `HUMIDITY: ${latestHistory.airMoisture}%`;
            } else {
                // Fallback values if no history entry exists
                gaugeValue.textContent = '45%';
                updateGauge(45);
                tempValue.textContent = '25°C';
                airMoisValue.textContent = 'HUMIDITY: No data';
            }

            // Update the card height when the plant info changes
            const controlModeCard = document.querySelector('.control-mode');
            const contentHeight = controlModeCard.scrollHeight;
            controlModeCard.style.height = `${contentHeight}px`;

            // Ensure the Send to ESP32 button is enabled when a plant is selected
            sendData.disabled = false;
        }
    }

    pumpOnBtn.addEventListener('click', () => {
        sendPumpCommand('on');
    });
    
    pumpOffBtn.addEventListener('click', () => {
        sendPumpCommand('off');
    });

    async function sendPumpCommand(state) {
        try {
            const response = await fetch('http://localhost:3000/control-pump', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ pumpState: state }) // Send "on" or "off"
            });
    
            const result = await response.json();
    
            if (!response.ok) {
                throw new Error(result.error || `Failed to turn pump ${state}`);
            }
    
            alert(`Pump turned ${state} successfully!`);
        } catch (error) {
            console.error(`Error turning pump ${state}:`, error);
            alert(`Error turning pump ${state}: ${error.message}`);
        }
    }

    // Call fetchPlants to load the plants when the page loads
    fetchPlants();

    plantSelect.addEventListener('change', () => {
        updatePlantInfo(plantSelect.value);
    });

    function updateGauge(value) {
        const percentage = parseFloat(value) || 0;
        const clampedValue = Math.min(Math.max(percentage, 0), 100);
        const arcLength = 251.2; // Circumference of the circle
        const offset = arcLength * (1 - clampedValue / 100);
        gaugeFill.style.strokeDashoffset = offset;
        gaugeValue.textContent = `${clampedValue}%`;
    }

    gaugeValue.addEventListener('input', () => {
        updateGauge(gaugeValue.textContent);
    });

    gaugeValue.addEventListener('blur', () => {
        updateGauge(gaugeValue.textContent);
    });

    const toggle = document.getElementById('mode-toggle');
    const modeTitle = document.getElementById('mode-title');
    const manualContent = document.getElementById('manual-content');
    const autoContent = document.getElementById('auto-content');
    const controlModeCard = document.querySelector('.control-mode');

    // Store the initial height of the Manual mode content
    const manualModeHeight = controlModeCard.scrollHeight;

    toggle.addEventListener('change', function () {
        if (toggle.checked) {
            modeTitle.textContent = 'AUTOMATIC MODE';
            manualContent.style.display = 'none';
            autoContent.style.display = 'block';
            // Update height based on Automatic mode content
            const contentHeight = controlModeCard.scrollHeight;
            controlModeCard.style.height = `${contentHeight}px`;
        } else {
            modeTitle.textContent = 'MANUAL MODE';
            manualContent.style.display = 'flex';
            autoContent.style.display = 'none';
            // Reset to the initial Manual mode height
            controlModeCard.style.height = `${manualModeHeight}px`;
        }
    });

    // Set the initial height
    controlModeCard.style.height = `${manualModeHeight}px`;

    // Dynamically create the modal
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'modal-overlay';
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.display = 'none';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    const modalTitle = document.createElement('h2');
    modalTitle.textContent = 'Add New Plant';
    const closeModalBtn = document.createElement('button');
    closeModalBtn.id = 'close-modal-btn';
    closeModalBtn.className = 'close-btn';
    closeModalBtn.textContent = 'X';
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeModalBtn);

    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';

    // Plant Name
    const plantNameGroup = document.createElement('div');
    plantNameGroup.className = 'form-group';
    const plantNameLabel = document.createElement('label');
    plantNameLabel.htmlFor = 'modal-plant-name';
    plantNameLabel.textContent = "Plant's Name:";
    const plantNameInput = document.createElement('input');
    plantNameInput.type = 'text';
    plantNameInput.id = 'modal-plant-name';
    plantNameInput.placeholder = 'Enter plant name';
    plantNameGroup.appendChild(plantNameLabel);
    plantNameGroup.appendChild(plantNameInput);

    // Lower Threshold
    const lowerThresholdGroup = document.createElement('div');
    lowerThresholdGroup.className = 'form-group';
    const lowerThresholdLabel = document.createElement('label');
    lowerThresholdLabel.htmlFor = 'modal-lower-threshold';
    lowerThresholdLabel.textContent = 'Lower Threshold (%):';
    const lowerThresholdInput = document.createElement('input');
    lowerThresholdInput.type = 'number';
    lowerThresholdInput.id = 'modal-lower-threshold';
    lowerThresholdInput.placeholder = '0-100';
    lowerThresholdGroup.appendChild(lowerThresholdLabel);
    lowerThresholdGroup.appendChild(lowerThresholdInput);

    // Upper Threshold
    const upperThresholdGroup = document.createElement('div');
    upperThresholdGroup.className = 'form-group';
    const upperThresholdLabel = document.createElement('label');
    upperThresholdLabel.htmlFor = 'modal-upper-threshold';
    upperThresholdLabel.textContent = 'Upper Threshold (%):';
    const upperThresholdInput = document.createElement('input');
    upperThresholdInput.type = 'number';
    upperThresholdInput.id = 'modal-upper-threshold';
    upperThresholdInput.placeholder = '0-100';
    upperThresholdGroup.appendChild(upperThresholdLabel);
    upperThresholdGroup.appendChild(upperThresholdInput);

    // Plant Info
    const plantInfoGroup = document.createElement('div');
    plantInfoGroup.className = 'form-group';
    const plantInfoLabel = document.createElement('label');
    plantInfoLabel.htmlFor = 'modal-plant-info';
    plantInfoLabel.textContent = "Plant's Info:";
    const plantInfoTextarea = document.createElement('textarea');
    plantInfoTextarea.id = 'modal-plant-info';
    plantInfoTextarea.placeholder = 'Enter plant info';
    plantInfoGroup.appendChild(plantInfoLabel);
    plantInfoGroup.appendChild(plantInfoTextarea);

    modalBody.appendChild(plantNameGroup);
    modalBody.appendChild(lowerThresholdGroup);
    modalBody.appendChild(upperThresholdGroup);
    modalBody.appendChild(plantInfoGroup);

    const modalFooter = document.createElement('div');
    modalFooter.className = 'modal-footer';
    const savePlantBtn = document.createElement('button');
    savePlantBtn.id = 'save-plant-btn';
    savePlantBtn.className = 'save-btn';
    savePlantBtn.textContent = 'Save';
    modalFooter.appendChild(savePlantBtn);

    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);
    modalOverlay.appendChild(modalContent);

    document.body.appendChild(modalOverlay);

    // Modal functionality
    const fileIcon = document.getElementById('file-icon');

    // Show the modal when the File Icon is clicked
    fileIcon.addEventListener('click', () => {
        modalOverlay.style.display = 'flex';
    });

    // Hide the modal when the X button is clicked
    closeModalBtn.addEventListener('click', () => {
        modalOverlay.style.display = 'none';
        // Clear the form
        plantNameInput.value = '';
        lowerThresholdInput.value = '';
        upperThresholdInput.value = '';
        plantInfoTextarea.value = '';
    });

    // Hide the modal when clicking outside the modal content
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.style.display = 'none';
            // Clear the form
            plantNameInput.value = '';
            lowerThresholdInput.value = '';
            upperThresholdInput.value = '';
            plantInfoTextarea.value = '';
        }
    });

    // Handle the Save button with validation and API call
    savePlantBtn.addEventListener('click', async () => {
        const plantName = plantNameInput.value.trim();
        const lowerThresholdValue = parseFloat(lowerThresholdInput.value);
        const upperThresholdValue = parseFloat(upperThresholdInput.value);
        const plantInfoValue = plantInfoTextarea.value.trim();

        if (!plantName || isNaN(lowerThresholdValue) || isNaN(upperThresholdValue) || !plantInfoValue) {
            alert('Please fill in all fields.');
            return;
        }

        if (lowerThresholdValue < 0 || lowerThresholdValue > 100 || upperThresholdValue < 0 || upperThresholdValue > 100) {
            alert('Lower and Upper Thresholds must be between 0 and 100.');
            return;
        }

        if (lowerThresholdValue >= upperThresholdValue) {
            alert('Lower Threshold must be less than Upper Threshold.');
            return;
        }

        // Send data to the backend
        try {
            const response = await fetch('http://localhost:3000/plants', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    Name: plantName,
                    info: plantInfoValue,
                    lowerThreshold: lowerThresholdValue,
                    upperThreshold: upperThresholdValue
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to add plant');
            }

            alert('Plant added successfully!');

            // Refresh the plant list
            await fetchPlants();

            // Close the modal and clear the form
            modalOverlay.style.display = 'none';
            plantNameInput.value = '';
            lowerThresholdInput.value = '';
            upperThresholdInput.value = '';
            plantInfoTextarea.value = '';
        } catch (error) {
            console.error('Error adding plant:', error);
            alert('Error adding plant: ' + error.message);
        }
    });

    // Handle the "Send Data to ESP32" button click
    sendData.addEventListener('click', async () => {
        const plantID = plantSelect.value;
        const selectedPlant = plants.find(plant => plant.plantID == plantID);
        if (!selectedPlant) {
            alert('Please select a plant.');
            return;
        }
    
        const dataToSend = {
            plantID: selectedPlant.plantID,
            lowerThreshold: selectedPlant.lowerThreshold,
            upperThreshold: selectedPlant.upperThreshold
        };
    
        try {
            const response = await fetch('http://localhost:3000/send-to-esp32', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dataToSend)
            });
    
            const result = await response.json();
    
            if (!response.ok) {
                throw new Error(result.error || 'Failed to send data to ESP32');
            }
    
            alert('Data sent to ESP32 successfully!');
        } catch (error) {
            console.error('Error sending data to ESP32:', error);
            alert('Error sending data to ESP32: ' + error.message);
        }
    });
});