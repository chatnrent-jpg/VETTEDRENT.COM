// Save as vettedrent-server/src/frontend/uiController.js

document.addEventListener("DOMContentLoaded", () => {
    // UI Element Binding
    const legalInput = document.getElementById("legalFullName");
    const sigInputField = document.getElementById("digitalSignature");
    const submitBtn = document.getElementById("primarySubmitButton");
    const btnTextSpan = submitBtn.querySelector(".btn-text");
    const disclosedTrack = document.getElementById("disclosedTrack");
    const pillOptions = document.querySelectorAll(".pill-option");

    // Dynamic State Configuration (Extractable from your calendar/tier attributes)
    let activeState = {
        tier: "RoomSanctuary",
        dailyRate: 45.00,
        stayDurationDays: 7, // Extracted directly from selected dates
        taxRate: 0.11 // Pro-rated combined MD state and county tax
    };

    // Mirroring Action: Typing name updates signature pad visual automatically
    legalInput.addEventListener("input", (e) => {
        sigInputField.value = e.target.value;
    });

    // Profile pill selector toggles
    pillOptions.forEach(pill => {
        pill.addEventListener("click", (e) => {
            pillOptions.forEach(p => p.classList.remove("active"));
            e.target.classList.add("active");
            activeState.occupancyProfile = e.target.getAttribute("data-profile");
        });
    });

    // Dynamically adjust button copy text based on stay length parameters
    function runInterfaceAssessment() {
        if (activeState.stayDurationDays >= 30) {
            btnTextSpan.textContent = "Continue to 60s Bank Verification";
            disclosedTrack.textContent = "Corporate Shielded License";
        } else {
            btnTextSpan.textContent = "Sign & Book Stay Instantly";
            disclosedTrack.textContent = "Transient Occupancy License";
        }
    }

    // Initialize layout state
    runInterfaceAssessment();

    // Intercept submit to send clean payload directly to api_dispatcher.lua
    submitBtn.addEventListener("click", () => {
        if (!legalInput.value || !sigInputField.value) {
            alert("Please input your full legal name to affirm documentation execution.");
            return;
        }

        const payload = {
            bookingId: "VR-2026-" + Math.floor(Math.random() * 10000),
            legalFullName: legalInput.value,
            emailAddress: document.getElementById("emailAddress").value,
            stayDurationDays: activeState.stayDurationDays,
            spaceTier: activeState.tier,
            whoIsStaying: activeState.occupancyProfile
        };

        console.log("Dispatched payload to central API Dispatcher Router:", payload);
        // Next Step: Execute fetch() POST to your deployed api_dispatcher gateway route
    });
});
