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

    //variebles for chart
    const POLLING_INTERVAL = 10000; // Poll every 10 seconds
    let currentPlantID = null; // Track the currently selected plant
    let latestTimestamps = {}; // Object to store latest timestamp per plantID
    let chartInstance = null; // Initializing chart instance

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

    //fetch all history for chart
    async function fetchallHistory()
    {
        try {
            const response = await fetch(`http://localhost:3000/history/latest`);
            if (!response.ok) {
                throw new Error('Failed to fetch history');
            }
            const history = await response.json();
            return history;
        } catch (error) {
            console.error('Error fetching all history:', error);
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
    fetchPlants().then(() => {
        const initialPlantID = plantSelect.value;
        updatePlantInfo(initialPlantID);
        updateChart(initialPlantID, false); // Update chart with the initial plant's history
        startPolling(); // Start polling for updates
    });

    plantSelect.addEventListener('change', () => {
        const plantID = plantSelect.value;
        updatePlantInfo(plantID);
        updateChart(plantID, false); // Update chart with the selected plant's history
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
        const plantID = plantSelect.value;
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
            updatePlantInfo(plantID);

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

    // Delete Plant Modal
    const deleteModalOverlay = document.createElement('div');
    deleteModalOverlay.id = 'delete-modal-overlay';
    deleteModalOverlay.className = 'modal-overlay';
    deleteModalOverlay.style.display = 'none';

    const deleteModalContent = document.createElement('div');
    deleteModalContent.className = 'modal-content';

    const deleteModalHeader = document.createElement('div');
    deleteModalHeader.className = 'modal-header';
    const deleteModalTitle = document.createElement('h2');
    deleteModalTitle.textContent = 'Delete Plant';
    const deleteCloseModalBtn = document.createElement('button');
    deleteCloseModalBtn.id = 'delete-close-modal-btn';
    deleteCloseModalBtn.className = 'close-btn';
    deleteCloseModalBtn.textContent = 'X';
    deleteModalHeader.appendChild(deleteModalTitle);
    deleteModalHeader.appendChild(deleteCloseModalBtn);

    const deleteModalBody = document.createElement('div');
    deleteModalBody.className = 'modal-body';

    // Plant Selection Dropdown
    const plantSelectGroup = document.createElement('div');
    plantSelectGroup.className = 'form-group';
    const plantSelectLabel = document.createElement('label');
    plantSelectLabel.htmlFor = 'delete-plant-select';
    plantSelectLabel.textContent = "Select Plant to Delete:";
    const deletePlantSelect = document.createElement('select');
    deletePlantSelect.id = 'delete-plant-select';
    deletePlantSelect.className = 'delete-plant-select';
    // Populate the dropdown
    plantSelectGroup.appendChild(plantSelectLabel);
    plantSelectGroup.appendChild(deletePlantSelect);

    deleteModalBody.appendChild(plantSelectGroup);

    const deleteModalFooter = document.createElement('div');
    deleteModalFooter.className = 'modal-footer';
    const cancelDeleteBtn = document.createElement('button');
    cancelDeleteBtn.id = 'cancel-delete-btn';
    cancelDeleteBtn.className = 'cancel-btn';
    cancelDeleteBtn.textContent = 'Cancel';
    const deletePlantBtn = document.createElement('button');
    deletePlantBtn.id = 'delete-plant-btn';
    deletePlantBtn.className = 'delete-btn';
    deletePlantBtn.textContent = 'Delete';
    deleteModalFooter.appendChild(cancelDeleteBtn);
    deleteModalFooter.appendChild(deletePlantBtn);

    deleteModalContent.appendChild(deleteModalHeader);
    deleteModalContent.appendChild(deleteModalBody);
    deleteModalContent.appendChild(deleteModalFooter);
    deleteModalOverlay.appendChild(deleteModalContent);

    document.body.appendChild(deleteModalOverlay);

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

    // Modal functionality for Delete Plant
    const settingsIcon = document.getElementById('settings-icon');

    // Function to populate the delete plant dropdown
    function populateDeletePlantDropdown() {
        deletePlantSelect.innerHTML = ''; // Clear existing options
        plants.forEach(plant => {
            const option = document.createElement('option');
            option.value = plant.plantID;
            option.textContent = plant.Name;
            deletePlantSelect.appendChild(option);
        });
    }

    // Show the modal when the Settings Icon is clicked
    settingsIcon.addEventListener('click', () => {
        populateDeletePlantDropdown(); // Populate dropdown with current plants
        deleteModalOverlay.style.display = 'flex';
    });

    // Hide the modal when the X button is clicked
    deleteCloseModalBtn.addEventListener('click', () => {
    deleteModalOverlay.style.display = 'none';
    });

    // Hide the modal when clicking outside the modal content
    deleteModalOverlay.addEventListener('click', (e) => {
    if (e.target === deleteModalOverlay) {
        deleteModalOverlay.style.display = 'none';
        }
    });

    // Handle the Cancel button
    cancelDeleteBtn.addEventListener('click', () => {
    deleteModalOverlay.style.display = 'none';
    });

    // Handle the Delete button
    deletePlantBtn.addEventListener('click', async () => {
        const plantIDToDelete = deletePlantSelect.value;

        if (!plantIDToDelete) {
            alert('Please select a plant to delete.');
            return;
        }

    // Confirm deletion
    if (!confirm(`Are you sure you want to delete the plant "${deletePlantSelect.options[deletePlantSelect.selectedIndex].text}"?`)) {
        return;
    }

    try {
        const response = await fetch(`http://localhost:3000/plants/${plantIDToDelete}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to delete plant');
        }

        alert('Plant deleted successfully!');

        // Refresh the plant list
        await fetchPlants();

        // Update the UI to reflect the currently selected plant (or the first plant if the deleted one was selected)
        const currentPlantID = plantSelect.value;
        if (currentPlantID === plantIDToDelete) {
            // If the deleted plant was selected, select the first plant in the list
            if (plants.length > 0) {
                updatePlantInfo(plants[0].plantID);
                updateChart(plants[0].plantID, false);
            } else {
                // No plants left, clear the UI
                lowerThreshold.textContent = 'N/A';
                upperThreshold.textContent = 'N/A';
                plantInfo.textContent = 'No plants available';
                gaugeValue.textContent = 'N/A';
                updateGauge(0);
                tempValue.textContent = 'N/A';
                airMoisValue.textContent = 'HUMIDITY: N/A';
                if (chartInstance) {
                    chartInstance.destroy();
                    chartInstance = null;
                }
            }
        } else {
            // Refresh the UI for the currently selected plant
            updatePlantInfo(currentPlantID);
            updateChart(currentPlantID, false);
        }

        // Close the modal
        deleteModalOverlay.style.display = 'none';
        } catch (error) {
        console.error('Error deleting plant:', error);
        alert('Error deleting plant: ' + error.message);
        }
    });

    //get history by plantID
    const MAX_CHART_ENTRIES = 10; // Define the maximum number of entries to display

    async function getHistoryByPlantID(plantID, since = null, limit = MAX_CHART_ENTRIES) {
        if (!plantID) {
        console.error('plantID is required for getHistoryByPlantID');
        return [];
        }

        try {
            let url = `http://localhost:3000/history/${plantID}?limit=${limit}`;
            if (since) {
            url += `&since=${encodeURIComponent(since)}`;
            }
            const response = await fetch(url);
            if (!response.ok) {
            throw new Error(`Failed to fetch history for plantID ${plantID}: ${response.status}`);
            }
            const history = await response.json();
            console.log(`History for plantID ${plantID}:`, history);
            return Array.isArray(history) ? history : [history].filter(item => item !== null && item !== undefined);
        } 
        catch (error) {
        console.error(`Error fetching history for plantID ${plantID}:`, error);
        return [];
        }
    }


    async function updateChart(plantID = null, isIncremental = false) {
    if (!plantID) {
        console.warn('plantID is required for updateChart');
        return;
    }

    if (currentPlantID !== plantID) {
        currentPlantID = plantID;
        latestTimestamps[plantID] = null; // Reset the latest timestamp for the new plant
        if (chartInstance) {
            chartInstance.destroy(); // Destroy the existing chart instance
            chartInstance = null; // Reset the chart instance
        }
    }   
    let since = latestTimestamps[plantID];
    if (isIncremental && chartInstance && chartInstance.data.datasets[0].timestamps && chartInstance.data.datasets[0].timestamps.length > 0) {
            since = chartInstance.data.datasets[0].timestamps[chartInstance.data.datasets[0].timestamps.length - 1];
            console.log(`Using since from last timestamp: ${since}`);
        }

    const history = await getHistoryByPlantID(plantID, since);
    if (!history || history.length === 0) {
        console.log(`No new history data for plantID ${plantID} since ${since}`);
        if (!isIncremental || !chartInstance) {
            // If not incremental or no chart instance, clear the chart
            const ctx = document.getElementById('soilMoistureChart').getContext('2d');
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
            chartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Soil Moisture (%)',
                            data: [],
                            borderColor: 'rgba(75, 192, 192, 1)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            fill: true,
                            tension: 0.4,
                            timestamps: [] // Add timestamps array
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { title: { display: true, text: 'Time' } },
                            y: { title: { display: true, text: 'Soil Moisture (%)' }, beginAtZero: true, max: 100 }
                        },
                        plugins: { legend: { display: true, position: 'top' } }
                    }
                });       
        }
        return; // No new data to update
    }

    //update latest timestamp
    if (history.length > 0) 
    {
        latestTimestamps[plantID] = history[history.length - 1].recorded; 
    }

    if (isIncremental && chartInstance) {
        // Filter and append only new entries
        const newEntries = history.filter(entry => {
            return !chartInstance.data.datasets[0].timestamps.includes(entry.recorded);
        });
        console.log(`New entries found: ${newEntries.length}`, newEntries);

        if (newEntries.length === 0) {
            console.log('No new entries to add');
            return; // Skip update if no new data
        }

        newEntries.forEach(entry => {
            chartInstance.data.labels.push(new Date(entry.recorded).toLocaleTimeString());
            chartInstance.data.datasets[0].data.push(entry.soilMoisture);
            chartInstance.data.datasets[0].timestamps.push(entry.recorded); // Store raw timestamp
        });

        // Enforce entry limit
        if (chartInstance.data.labels.length > MAX_CHART_ENTRIES) {
            const excess = chartInstance.data.labels.length - MAX_CHART_ENTRIES;
            chartInstance.data.labels.splice(0, excess);
            chartInstance.data.datasets[0].data.splice(0, excess);
            chartInstance.data.datasets[0].timestamps.splice(0, excess); // Sync timestamps with labels
        }

        chartInstance.update();
        return;
    }

    const limitedHistory = history.slice(-MAX_CHART_ENTRIES); // Limit to the last 10 entries
    // Prepare data
    const labels = limitedHistory.map(entry => new Date(entry.recorded).toLocaleTimeString());
    const soilMoistureData = limitedHistory.map(entry => entry.soilMoisture);
    const timestamps = limitedHistory.map(entry => entry.recorded); 

    const ctx = document.getElementById('soilMoistureChart').getContext('2d');

    // Destroy existing chart instance if it exists
    if (chartInstance) {
        chartInstance.destroy();
    }

    // Create new chart
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels, // Time labels for x-axis
            datasets: [{
                label: 'Soil Moisture (%)',
                data: soilMoistureData,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                fill: true,
                tension: 0.4,
                timestamps: timestamps 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Soil Moisture (%)'
                    },
                    beginAtZero: true,
                    max: 100
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            }
        }
    });
    }

    function startPolling() {
        setInterval(async () => {
            if (currentPlantID) {
            try {
                console.log(`Polling for plantID ${currentPlantID} at ${new Date().toLocaleTimeString()} with since ${latestTimestamps[currentPlantID] || 'null'}`);
                await updatePlantInfo(currentPlantID);
                await updateChart(currentPlantID, true);
                } 
            catch (error) {
                console.error('Polling error:', error);
                }
            } else {
            console.warn('No plantID selected for polling');
            }
        }, POLLING_INTERVAL);
    }

});