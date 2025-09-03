// Test script to verify class matching logic
const seriesData = {
    "id": "fc55b1e1-d9fc-442c-bdab-9bb7874660c2",
    "racingClasses": [
        {
            "id": "class_1751979436251_1oroniehp",
            "name": "600 Stock",
            "defaultFee": 50,
            "description": "600 Stock class racing"
        },
        {
            "id": "class_1751979436251_aqz1dslsy",
            "name": "600 Improve",
            "defaultFee": 100,
            "description": "600 Improve class racing"
        },
        {
            "id": "class_1751979436251_8pw5q4asb",
            "name": "800 Stock",
            "defaultFee": 50,
            "description": "800 Stock class racing"
        },
        {
            "id": "class_1751979436251_e4wuwrji4",
            "name": "800 Improve",
            "defaultFee": 100,
            "description": "800 Improve class racing"
        },
        {
            "id": "class_1751979436251_5h1rbujg3",
            "name": "1000 Stock",
            "defaultFee": 100,
            "description": "1000 Stock class racing"
        },
        {
            "id": "class_1751979436251_w5ibw72qw",
            "name": "1000 Improve",
            "defaultFee": 150,
            "description": "1000 Improve class racing"
        },
        {
            "id": "class_1751979436251_jeqw190kf",
            "name": "4 temps",
            "defaultFee": 250,
            "description": "4 temps class racing"
        },
        {
            "id": "class_1751979436251_0hywr2ry0",
            "name": "Pro-Max",
            "defaultFee": 500,
            "description": "Pro-Max class racing"
        },
        {
            "id": "class_1751979436251_1pqtyjd1z",
            "name": "Outlaw",
            "defaultFee": 1000,
            "description": "Outlaw class racing"
        }
    ]
};

const participantClasses = ["Outlaw", "Pro-Max", "4 temps", "1000 Improve"];

console.log("Testing class matching logic...");
console.log("Available classes:", seriesData.racingClasses.map(c => ({ id: c.id, name: c.name })));
console.log("Participant classes:", participantClasses);

participantClasses.forEach(classId => {
    // Find class details - handle both ID and name-based lookups
    let classDetail = seriesData.racingClasses.find(c => c.id === classId);
    if (!classDetail) {
        // Fallback: look up by name if not found by ID
        classDetail = seriesData.racingClasses.find(c => c.name === classId);
    }
    if (!classDetail) {
        // Additional fallback: case-insensitive name matching
        classDetail = seriesData.racingClasses.find(c => 
            c.name.toLowerCase() === classId.toLowerCase()
        );
    }
    
    const className = classDetail ? classDetail.name : classId;
    const actualClassId = classDetail ? classDetail.id : classId;
    
    console.log(`Class "${classId}" -> Found: ${classDetail ? 'YES' : 'NO'}, Name: "${className}", ID: "${actualClassId}"`);
});

console.log("Test completed!"); 