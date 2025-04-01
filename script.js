document.addEventListener('DOMContentLoaded', function () {
    const gaugeFill = document.querySelector('.gauge-fill');
    const gaugeValue = document.querySelector('.gauge-value');
    const plantSelect = document.getElementById('plant-select');
    const lowerThreshold = document.getElementById('lower-threshold');
    const upperThreshold = document.getElementById('upper-threshold');
    const plantInfo = document.getElementById('plant-info');

    // Hardcoded plant data
    const plants = [
        { name: "SIGMA", lower_threshold: 0, upper_threshold: 0, info: "REAL MEN DO NOT DRINK WATER, SET MOISTURE TO 0. WHY DA HELL WE NEED TO DRINK WATER, HUH?" },
        { name: "Skibidi", lower_threshold: 0, upper_threshold: 100, info: "skibidi dopdop yesyes skibidi dop yesyes, skibidi dopdop yesyes skibidi dop yesyes" },
        { name: "Thằng homie hêu", lower_threshold: 10, upper_threshold: 30, info: "Thằng homie béo vcl, chứa rất nhiều nước (và mỡ), lượng nước (và mỡ) trong cơ thể này giống như SĐT của tôi vậy" }
    ];

    function updatePlantInfo(selectedPlantName) {
        const selectedPlant = plants.find(plant => plant.name === selectedPlantName);
        if (selectedPlant) {
            lowerThreshold.textContent = `${selectedPlant.lower_threshold}%`;
            upperThreshold.textContent = `${selectedPlant.upper_threshold}%`;
            plantInfo.textContent = selectedPlant.info;
            // Update the card height when the plant info changes
            const controlModeCard = document.querySelector('.control-mode');
            const contentHeight = controlModeCard.scrollHeight;
            controlModeCard.style.height = `${contentHeight}px`;
        }
    }

    updatePlantInfo(plantSelect.value);

    plantSelect.addEventListener('change', () => {
        updatePlantInfo(plantSelect.value);
    });

    function updateGauge(value) {
        const percentage = parseInt(value.replace('%', '')) || 0;
        const clampedValue = Math.min(Math.max(percentage, 0), 100);
        const arcLength = 251.2; // Circumference of the circle
        const offset = arcLength * (1 - clampedValue / 100);
        gaugeFill.style.strokeDashoffset = offset;
        gaugeValue.textContent = `${clampedValue}%`;
    }

    updateGauge(gaugeValue.textContent);

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
});