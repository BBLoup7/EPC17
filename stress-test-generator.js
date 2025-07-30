const fs = require('fs');
const path = require('path');

// Configuration for stress test
const STRESS_TEST_CONFIG = {
    seriesCount: 4, // Doubled from 2
    eventsPerSeries: 10, // 40 total events (doubled from 20)
    driversPerEvent: { min: 100, max: 350 }, // Increased max to 350
    driverEventsRange: { min: 1, max: 10 }, // drivers participate in 1-10 events
    classesPerEvent: { min: 3, max: 7 },
    classesPerDriver: { min: 1, max: 3 },
    totalDriversNeeded: 12000 // Increased for 40 events with 100-350 drivers each
};

// Sample data for realistic generation
const FIRST_NAMES = [
    // English names
    'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Christopher',
    'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua',
    'Kenneth', 'Kevin', 'Brian', 'George', 'Edward', 'Ronald', 'Timothy', 'Jason', 'Jeffrey', 'Ryan',
    'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon',
    'Benjamin', 'Samuel', 'Frank', 'Gregory', 'Raymond', 'Alexander', 'Patrick', 'Jack', 'Dennis', 'Jerry',
    'Tyler', 'Aaron', 'Jose', 'Adam', 'Nathan', 'Henry', 'Douglas', 'Zachary', 'Peter', 'Kyle',
    'Walter', 'Ethan', 'Jeremy', 'Harold', 'Carl', 'Keith', 'Roger', 'Gerald', 'Christian', 'Terry',
    'Sean', 'Austin', 'Noah', 'Lucas', 'Mason', 'Logan', 'Oliver', 'Elijah', 'Aiden', 'Caden',
    'Grayson', 'Liam', 'Owen', 'Wyatt', 'Hunter', 'Levi', 'Isaac', 'Evan', 'Dylan', 'Nathaniel',
    
    // French names
    'Jean', 'Pierre', 'Michel', 'André', 'Philippe', 'Claude', 'Jacques', 'François', 'Marc', 'Bernard',
    'Denis', 'Gérard', 'Robert', 'Marcel', 'Roger', 'Henri', 'Louis', 'Paul', 'Maurice', 'Guy',
    'Alain', 'René', 'Georges', 'Jean-Pierre', 'Jean-Claude', 'Jean-Michel', 'Jean-Paul', 'Jean-François',
    'Marie', 'Sophie', 'Isabelle', 'Catherine', 'Nathalie', 'Sylvie', 'Martine', 'Monique', 'Danielle',
    'Françoise', 'Christine', 'Nicole', 'Jacqueline', 'Suzanne', 'Louise', 'Hélène', 'Anne', 'Claire',
    'Caroline', 'Valérie', 'Sandrine', 'Stéphanie', 'Laurence', 'Pascale', 'Dominique', 'Brigitte',
    
    // Spanish names
    'Carlos', 'Miguel', 'Jose', 'Luis', 'Antonio', 'Francisco', 'Manuel', 'David', 'Javier', 'Daniel',
    'Juan', 'Pedro', 'Rafael', 'Fernando', 'Alberto', 'Eduardo', 'Sergio', 'Roberto', 'Ricardo', 'Diego',
    'Alejandro', 'Gabriel', 'Mario', 'Victor', 'Hector', 'Adrian', 'Raul', 'Oscar', 'Pablo', 'Andres',
    'Maria', 'Carmen', 'Ana', 'Isabel', 'Dolores', 'Pilar', 'Teresa', 'Rosa', 'Concepcion', 'Josefa',
    'Lucia', 'Mercedes', 'Josefina', 'Francisca', 'Antonia', 'Diana', 'Elena', 'Monica', 'Beatriz',
    
    // Italian names
    'Giuseppe', 'Marco', 'Alessandro', 'Andrea', 'Luca', 'Roberto', 'Matteo', 'Davide', 'Stefano', 'Antonio',
    'Francesco', 'Mario', 'Luigi', 'Vincenzo', 'Giovanni', 'Angelo', 'Salvatore', 'Domenico', 'Carlo',
    'Paolo', 'Massimo', 'Claudio', 'Simone', 'Riccardo', 'Alberto', 'Emanuele', 'Federico', 'Lorenzo',
    'Maria', 'Anna', 'Giuseppina', 'Rosa', 'Angela', 'Giovanna', 'Sofia', 'Alessandra', 'Valentina',
    'Chiara', 'Martina', 'Elisa', 'Silvia', 'Laura', 'Elena', 'Monica', 'Daniela', 'Stefania',
    
    // German names
    'Hans', 'Peter', 'Michael', 'Wolfgang', 'Klaus', 'Thomas', 'Manfred', 'Helmut', 'Werner', 'Dieter',
    'Gerhard', 'Horst', 'Karl', 'Heinz', 'Jürgen', 'Rolf', 'Uwe', 'Frank', 'Bernd', 'Günter',
    'Andreas', 'Christian', 'Stefan', 'Martin', 'Matthias', 'Markus', 'Jens', 'Torsten', 'Dirk',
    'Maria', 'Ursula', 'Monika', 'Petra', 'Renate', 'Brigitte', 'Karin', 'Elke', 'Sabine', 'Angelika',
    'Andrea', 'Susanne', 'Claudia', 'Stefanie', 'Nicole', 'Katrin', 'Anja', 'Silke', 'Birgit',
    
    // Scandinavian names
    'Erik', 'Lars', 'Anders', 'Johan', 'Per', 'Mikael', 'Bjorn', 'Magnus', 'Henrik', 'Stefan',
    'Mats', 'Jan', 'Ola', 'Kjell', 'Gunnar', 'Sven', 'Tomas', 'Daniel', 'Marcus', 'Fredrik',
    'Anna', 'Maria', 'Karin', 'Eva', 'Birgitta', 'Kerstin', 'Lena', 'Sofia', 'Helena', 'Ingrid',
    'Elisabeth', 'Margareta', 'Kristina', 'Cecilia', 'Malin', 'Sara', 'Emma', 'Ida', 'Nina',
    
    // Eastern European names
    'Ivan', 'Dmitri', 'Sergei', 'Vladimir', 'Nikolai', 'Andrei', 'Alexei', 'Mikhail', 'Yuri', 'Boris',
    'Viktor', 'Anatoli', 'Konstantin', 'Pavel', 'Roman', 'Denis', 'Evgeni', 'Artem', 'Daniil', 'Kirill',
    'Elena', 'Olga', 'Natalia', 'Irina', 'Tatiana', 'Svetlana', 'Anna', 'Maria', 'Ekaterina', 'Yulia',
    'Anastasia', 'Daria', 'Polina', 'Ksenia', 'Alina', 'Viktoria', 'Kristina', 'Angelina', 'Veronika',
    
    // Asian names
    'Wei', 'Ming', 'Jian', 'Hui', 'Xia', 'Yong', 'Feng', 'Lei', 'Tao', 'Jun',
    'Li', 'Wang', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou',
    'Yuki', 'Hiroshi', 'Takashi', 'Kenji', 'Takeshi', 'Masato', 'Kazuki', 'Daiki', 'Ryo', 'Shota',
    'Akira', 'Yusuke', 'Tatsuya', 'Koji', 'Makoto', 'Shinji', 'Toshi', 'Kenta', 'Yuta', 'Keita',
    'Sakura', 'Yumi', 'Akiko', 'Mika', 'Yuki', 'Ayumi', 'Eri', 'Mai', 'Nana', 'Rika',
    'Haruka', 'Aiko', 'Yui', 'Mami', 'Saki', 'Miki', 'Kaori', 'Tomoko', 'Yoko', 'Reiko',
    
    // Middle Eastern names
    'Ahmed', 'Mohammed', 'Ali', 'Hassan', 'Hussein', 'Omar', 'Yusuf', 'Ibrahim', 'Khalil', 'Rashid',
    'Mahmoud', 'Samir', 'Karim', 'Tariq', 'Zaid', 'Malik', 'Amir', 'Jamil', 'Faisal', 'Nasser',
    'Fatima', 'Aisha', 'Zainab', 'Mariam', 'Khadija', 'Huda', 'Noor', 'Layla', 'Yasmin', 'Amira',
    'Nadia', 'Rania', 'Dalia', 'Samira', 'Leila', 'Hana', 'Sara', 'Nour', 'Rima', 'Maya',
    
    // African names
    'Kwame', 'Kofi', 'Ama', 'Abena', 'Akua', 'Yaw', 'Kwesi', 'Kwaku', 'Adwoa', 'Akwasi',
    'Mamadou', 'Fatou', 'Aissatou', 'Moussa', 'Ousmane', 'Mariama', 'Aminata', 'Ibrahima', 'Boubacar', 'Aissata',
    'Zulu', 'Thabo', 'Lerato', 'Tshepo', 'Kagiso', 'Puleng', 'Sipho', 'Nokuthula', 'Vusi', 'Nomsa',
    'Kemi', 'Adebayo', 'Folake', 'Tunde', 'Bisi', 'Kemi', 'Ayo', 'Yemi', 'Tola', 'Bunmi'
];

const LAST_NAMES = [
    // English surnames
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
    'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
    'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
    'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes',
    'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper',
    'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson',
    'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes',
    
    // French surnames
    'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau',
    'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier',
    'Morel', 'Girard', 'Andre', 'Lefevre', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'Francois', 'Martinez',
    'Legrand', 'Garnier', 'Faure', 'Rousseau', 'Blanc', 'Guerin', 'Muller', 'Henry', 'Roussel', 'Nicolas',
    'Perrin', 'Morin', 'Mathieu', 'Clement', 'Gauthier', 'Dumont', 'Lopez', 'Fontaine', 'Chevalier', 'Robin',
    
    // Spanish surnames
    'Garcia', 'Rodriguez', 'Gonzalez', 'Fernandez', 'Lopez', 'Martinez', 'Sanchez', 'Perez', 'Gomez', 'Martin',
    'Jimenez', 'Ruiz', 'Hernandez', 'Diaz', 'Moreno', 'Alvarez', 'Munoz', 'Romero', 'Alonso', 'Gutierrez',
    'Navarro', 'Torres', 'Dominguez', 'Vazquez', 'Ramos', 'Gil', 'Ramirez', 'Serrano', 'Blanco', 'Suarez',
    'Molina', 'Morales', 'Ortega', 'Delgado', 'Castro', 'Ortiz', 'Rubio', 'Marin', 'Sanz', 'Iglesias',
    'Medina', 'Cortes', 'Castillo', 'Garrido', 'Santos', 'Lozano', 'Guerrero', 'Cano', 'Prieto', 'Mendez',
    
    // Italian surnames
    'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco',
    'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti',
    'Bruni', 'Fontana', 'Caruso', 'Ferrara', 'Santoro', 'Leone', 'Longo', 'Galli', 'Rinaldi', 'Ferrara',
    'Villa', 'Marini', 'Bianco', 'Ferrari', 'Rizzo', 'Moretti', 'Bruno', 'Gallo', 'Conti', 'De Luca',
    'Mancini', 'Costa', 'Giordano', 'Lombardi', 'Fontana', 'Caruso', 'Santoro', 'Leone', 'Longo', 'Galli',
    
    // German surnames
    'Muller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann',
    'Schaffer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schroder', 'Neumann', 'Schwarz', 'Zimmermann',
    'Braun', 'Kruger', 'Hofmann', 'Hartmann', 'Lange', 'Schmitt', 'Werner', 'Schmitz', 'Krause', 'Meier',
    'Lehmann', 'Schmid', 'Schulze', 'Maier', 'Kohler', 'Herrmann', 'Konig', 'Walter', 'Mayer', 'Huber',
    'Kaiser', 'Fuchs', 'Peters', 'Lang', 'Scholz', 'Moller', 'Weiss', 'Jung', 'Hahn', 'Schubert',
    
    // Scandinavian surnames
    'Andersen', 'Johansen', 'Nilsen', 'Hansen', 'Pedersen', 'Olsen', 'Larsen', 'Christensen', 'Sorensen', 'Rasmussen',
    'Jensen', 'Madsen', 'Kristensen', 'Olsen', 'Thomsen', 'Christiansen', 'Poulsen', 'Johannesen', 'Knudsen', 'Mortensen',
    'Mikkelsen', 'Henriksen', 'Jakobsen', 'Lund', 'Rasmussen', 'Holm', 'Kristiansen', 'Clausen', 'Simonsen', 'Svendsen',
    'Andreasen', 'Iversen', 'Jeppesen', 'Mogensen', 'Jepsen', 'Lauridsen', 'Laursen', 'Jorgensen', 'Aagaard', 'Frederiksen',
    
    // Eastern European surnames
    'Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Vasiliev', 'Petrov', 'Sokolov', 'Mikhailov', 'Novikov', 'Fedorov',
    'Morozov', 'Volkov', 'Alekseev', 'Lebedev', 'Semenov', 'Egorov', 'Pavlov', 'Kozlov', 'Stepanov', 'Nikolaev',
    'Orlov', 'Andreev', 'Makarov', 'Nikitin', 'Zakharov', 'Zaitsev', 'Sokolov', 'Stepanov', 'Kuzmin', 'Kolesnikov',
    'Soloviev', 'Baranov', 'Karpov', 'Sobolev', 'Golubev', 'Titov', 'Sergeev', 'Fadeev', 'Komarov', 'Orlov',
    
    // Asian surnames
    'Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou',
    'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'Lin', 'He', 'Gao', 'Luo', 'Zheng',
    'Liang', 'Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu',
    'Tanaka', 'Sato', 'Suzuki', 'Takahashi', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato',
    'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi', 'Saito', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu',
    
    // Middle Eastern surnames
    'Al-Sayed', 'Al-Rashid', 'Al-Zahra', 'Al-Mahmoud', 'Al-Hassan', 'Al-Ali', 'Al-Mohammed', 'Al-Ahmed', 'Al-Khalil', 'Al-Rashid',
    'Al-Mahmoud', 'Al-Samir', 'Al-Karim', 'Al-Tariq', 'Al-Zaid', 'Al-Malik', 'Al-Amir', 'Al-Jamil', 'Al-Faisal', 'Al-Nasser',
    'Al-Fatima', 'Al-Aisha', 'Al-Zainab', 'Al-Mariam', 'Al-Khadija', 'Al-Huda', 'Al-Noor', 'Al-Layla', 'Al-Yasmin', 'Al-Amira',
    'Al-Nadia', 'Al-Rania', 'Al-Dalia', 'Al-Samira', 'Al-Leila', 'Al-Hana', 'Al-Sara', 'Al-Nour', 'Al-Rima', 'Al-Maya',
    
    // African surnames
    'Mensah', 'Owusu', 'Addo', 'Asante', 'Boateng', 'Darko', 'Essien', 'Frimpong', 'Gyamfi', 'Kufuor',
    'Mensah', 'Nkrumah', 'Osei', 'Poku', 'Quartey', 'Sarpong', 'Tetteh', 'Umar', 'Vanderpuye', 'Wiafe',
    'Diallo', 'Diop', 'Fall', 'Gueye', 'Kane', 'Ndiaye', 'Sall', 'Seck', 'Sy', 'Thiam',
    'Zulu', 'Nkosi', 'Dlamini', 'Mthembu', 'Ndlovu', 'Shabangu', 'Maseko', 'Nkabinde', 'Mkhize', 'Zungu'
];

const LOCATIONS = [
    'Valcourt', 'Beauceville', 'Montreal', 'Quebec City', 'Sherbrooke', 'Trois-Rivieres', 'Saguenay', 'Gatineau',
    'Laval', 'Longueuil', 'Levis', 'Saint-Jean-sur-Richelieu', 'Drummondville', 'Saint-Jerome', 'Shawinigan',
    'Saint-Georges', 'Victoriaville', 'Rimouski', 'Saint-Hyacinthe', 'Joliette', 'Saint-Eustache', 'Mirabel',
    'Saint-Bruno-de-Montarville', 'Brossard', 'Repentigny', 'Blainville', 'Saint-Constant', 'Boisbriand',
    'Vaudreuil-Dorion', 'Saint-Lazare', 'Beloeil', 'Salaberry-de-Valleyfield', 'Chateauguay', 'Mascouche',
    'Terrebonne', 'Saint-Jean-sur-Richelieu', 'Granby', 'Saint-Hubert', 'Boucherville', 'Saint-Lambert'
];

const CLASS_NAMES = [
    '600 Stock', '600 Improve', '800 Stock', '800 Improve', '1000 Stock', '1000 Improve',
    '4 temps', 'Pro-Max', 'Outlaw', 'Sport', 'Vintage', 'Junior', 'Senior', 'Master',
    'Open', 'Limited', 'Unlimited', 'Street', 'Modified', 'Super Stock',
    'Turbo', 'Naturally Aspirated', 'Electric', 'Hybrid', 'Custom', 'Factory',
    'Amateur', 'Professional', 'Expert', 'Novice', 'Championship', 'Exhibition'
];

const CLASS_PRICES = [50, 100, 200, 400]; // Fixed prices as requested

const TRACK_SURFACES = ['snow', 'ice', 'mixed'];
const ELIMINATION_TYPES = ['single', 'double'];
const WEATHER_CONTINGENCIES = ['proceed', 'postpone', 'cancel'];

// Utility functions
function generateId() {
    // Use the same ID format as the data manager
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for environments that don't support crypto.randomUUID
    return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function generateTimestamp() {
    return new Date().toISOString();
}

function randomFromArray(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function generateDriverName() {
    return `${randomFromArray(FIRST_NAMES)} ${randomFromArray(LAST_NAMES)}`;
}

function generateEmail(name) {
    const cleanName = name.toLowerCase().replace(/\s+/g, '');
    const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'racing.com'];
    return `${cleanName}${randomInt(1, 999)}@${randomFromArray(domains)}`;
}

function generatePhone() {
    return `${randomInt(100, 999)}-${randomInt(100, 999)}-${randomInt(1000, 9999)}`;
}

// Generate series data
function generateSeries() {
    const series = [];
    
    for (let i = 0; i < STRESS_TEST_CONFIG.seriesCount; i++) {
        const seriesId = generateId();
        const createdAt = generateTimestamp();
        
        const seriesData = {
            id: seriesId,
            name: `Stress Test Series ${i + 1}`,
            description: `Performance stress test series ${i + 1} with high volume data`,
            status: 'active',
            registrationFee: randomInt(0, 500),
            pointsSystem: 'standard',
            seasonStartDate: '2025-01-01',
            seasonEndDate: '2025-12-31',
            rules: 'Standard racing rules apply',
            sledClasses: [],
            events: [],
            standings: [],
            createdAt: createdAt,
            updatedAt: createdAt,
            createdDate: new Date(createdAt).toISOString().split('T')[0]
        };
        
        // Generate classes for this series
        const classCount = randomInt(5, 10);
        for (let j = 0; j < classCount; j++) {
            const classId = generateId();
            seriesData.sledClasses.push({
                id: classId,
                name: CLASS_NAMES[j % CLASS_NAMES.length],
                defaultFee: randomFromArray(CLASS_PRICES), // Use fixed prices
                description: `${CLASS_NAMES[j % CLASS_NAMES.length]} class racing`
            });
        }
        
        series.push(seriesData);
    }
    
    return series;
}

// Generate events data
function generateEvents(series) {
    const events = [];
    
    series.forEach((seriesData, seriesIndex) => {
        for (let i = 0; i < STRESS_TEST_CONFIG.eventsPerSeries; i++) {
            const eventId = generateId();
            const createdAt = generateTimestamp();
            const eventDate = new Date(2025, randomInt(0, 11), randomInt(1, 28)).toISOString().split('T')[0];
            
            const classCount = randomInt(STRESS_TEST_CONFIG.classesPerEvent.min, STRESS_TEST_CONFIG.classesPerEvent.max);
            const selectedClasses = seriesData.sledClasses.slice(0, classCount);
            
            const eventData = {
                id: eventId,
                name: `Stress Event ${seriesIndex + 1}-${i + 1}`,
                eventName: `Stress Event ${seriesIndex + 1}-${i + 1}`,
                date: eventDate,
                location: randomFromArray(LOCATIONS),
                seriesId: seriesData.id,
                numberOfTracks: randomInt(2, 4), // 2, 3, or 4 lanes as requested
                eliminationType: 'double', // Always double elimination as requested
                trackSurface: randomFromArray(TRACK_SURFACES),
                weatherContingency: randomFromArray(WEATHER_CONTINGENCIES),
                driverMeetingTime: `${randomInt(6, 10).toString().padStart(2, '0')}:${randomInt(0, 59).toString().padStart(2, '0')}`,
                maxParticipants: randomInt(STRESS_TEST_CONFIG.driversPerEvent.max, STRESS_TEST_CONFIG.driversPerEvent.max * 2),
                currentParticipants: 0,
                participants: [],
                registrationOpen: true,
                requiresClassSeparation: true,
                freeRunEnabled: false, // Always disabled (fair) as requested
                description: `High volume stress test event ${seriesIndex + 1}-${i + 1}`,
                classSettings: selectedClasses.map(cls => ({
                    classId: cls.id,
                    className: cls.name,
                    description: cls.description,
                    fee: cls.defaultFee
                })),
                classOrder: selectedClasses.map(cls => cls.id),
                status: 'upcoming',
                createdAt: createdAt,
                updatedAt: createdAt,
                createdDate: new Date(createdAt).toISOString().split('T')[0]
            };
            
            events.push(eventData);
        }
    });
    
    return events;
}

// Generate drivers data
function generateDrivers(events) {
    const drivers = [];
    const driverIds = new Set();
    
    // Calculate total drivers needed
    const totalDriversNeeded = STRESS_TEST_CONFIG.totalDriversNeeded;
    
    for (let i = 0; i < totalDriversNeeded; i++) {
        const driverId = generateId();
        driverIds.add(driverId);
        
        const driverName = generateDriverName();
        const createdAt = generateTimestamp();
        const dob = new Date(1980 + randomInt(0, 40), randomInt(0, 11), randomInt(1, 28)).toISOString().split('T')[0];
        
        // Determine which events this driver participates in
        const eventsToParticipate = randomInt(STRESS_TEST_CONFIG.driverEventsRange.min, STRESS_TEST_CONFIG.driverEventsRange.max);
        const selectedEvents = [];
        const availableEvents = [...events];
        
        for (let j = 0; j < eventsToParticipate && availableEvents.length > 0; j++) {
            const eventIndex = randomInt(0, availableEvents.length - 1);
            const selectedEvent = availableEvents.splice(eventIndex, 1)[0];
            selectedEvents.push(selectedEvent);
        }
        
        // Ensure driver is assigned to at least one event
        if (selectedEvents.length === 0 && events.length > 0) {
            selectedEvents.push(events[randomInt(0, events.length - 1)]);
        }
        
        // Select classes for this driver (1-3 classes)
        const classCount = randomInt(STRESS_TEST_CONFIG.classesPerDriver.min, STRESS_TEST_CONFIG.classesPerDriver.max);
        const availableClasses = [...CLASS_NAMES];
        const selectedClasses = [];
        
        for (let j = 0; j < classCount && availableClasses.length > 0; j++) {
            const classIndex = randomInt(0, availableClasses.length - 1);
            selectedClasses.push(availableClasses.splice(classIndex, 1)[0]);
        }
        
        const driverData = {
            id: driverId,
            name: driverName,
            nickname: randomInt(0, 3) === 0 ? driverName.split(' ')[0].toLowerCase() : '',
            dob: dob,
            racingNumber: randomInt(0, 2) === 0 ? randomInt(1, 999).toString() : null,
            eventId: selectedEvents.length > 0 ? selectedEvents[0].id : null,
            registrationType: 'event',
            registrationDate: new Date(createdAt).toISOString().split('T')[0],
            paymentStatus: randomFromArray(['pending', 'paid', 'waived']),
            status: 'active',
            selectedClasses: selectedClasses,
            sledClasses: selectedClasses,
            sledClass: selectedClasses[0] || '',
            totalFee: selectedClasses.reduce((sum, cls) => sum + randomFromArray(CLASS_PRICES), 0),
            contact: {
                email: generateEmail(driverName),
                phone: generatePhone(),
                emergency: generatePhone()
            },
            sponsors: randomInt(0, 2) === 0 ? [`Sponsor ${randomInt(1, 100)}`] : [],
            sledConfigurations: {},
            statistics: {
                totalRaces: 0,
                totalWins: 0,
                winRate: 0,
                avgPosition: 0,
                bestStreak: 0,
                eventsParticipated: 0,
                lanePerformance: {},
                recentWinRate: 0,
                lastUpdated: createdAt,
                lastCalculated: Date.now(),
                totalLosses: 0,
                bestPosition: null,
                worstPosition: null,
                raceHistory: []
            },
            avgPosition: 0,
            bestStreak: 0,
            eventsParticipated: 0,
            lanePerformance: {},
            lastRaceDate: null,
            totalRaces: 0,
            totalWins: 0,
            winRate: 0,
            createdAt: createdAt,
            updatedAt: createdAt
        };
        
        // Generate sled configurations for each class
        selectedClasses.forEach(className => {
            driverData.sledConfigurations[className] = {
                engine: `${randomInt(400, 1200)}cc`,
                make: randomFromArray(['Polaris', 'Ski-Doo', 'Arctic Cat', 'Yamaha']),
                model: randomFromArray(['Summit', 'Renegade', 'Thundercat', 'Viper']),
                year: randomInt(2015, 2024).toString()
            };
        });
        
        drivers.push(driverData);
    }
    
    return drivers;
}

// Update events with participant lists
function updateEventsWithParticipants(events, drivers) {
    const updatedEvents = [...events];
    
    // Create a map of drivers by their participation
    const driverParticipation = new Map();
    
    // First, ensure each driver is assigned to at least one event
    drivers.forEach(driver => {
        if (driver.eventId) {
            if (!driverParticipation.has(driver.eventId)) {
                driverParticipation.set(driver.eventId, []);
            }
            driverParticipation.get(driver.eventId).push(driver.id);
        }
    });
    
    // Update each event with its participants
    updatedEvents.forEach(event => {
        const participants = driverParticipation.get(event.id) || [];
        event.participants = participants;
        event.currentParticipants = participants.length;
        
        // Ensure the event has enough participants for stress testing
        if (participants.length < STRESS_TEST_CONFIG.driversPerEvent.min) {
            console.warn(`⚠️ Event ${event.name} has only ${participants.length} participants, minimum is ${STRESS_TEST_CONFIG.driversPerEvent.min}`);
        }
    });
    
    return updatedEvents;
}

// Validate data integrity
function validateDataIntegrity(series, events, drivers) {
    console.log('🔍 Running data integrity validation...');
    
    // Check that all drivers have valid eventId
    const driversWithoutEvent = drivers.filter(d => !d.eventId);
    if (driversWithoutEvent.length > 0) {
        console.warn(`⚠️ Found ${driversWithoutEvent.length} drivers without eventId`);
    }
    
    // Check that all events have participants
    const eventsWithoutParticipants = events.filter(e => e.participants.length === 0);
    if (eventsWithoutParticipants.length > 0) {
        console.warn(`⚠️ Found ${eventsWithoutParticipants.length} events without participants`);
    }
    
    // Check that all participant IDs in events exist in drivers
    const allDriverIds = new Set(drivers.map(d => d.id));
    let missingParticipants = 0;
    
    events.forEach(event => {
        event.participants.forEach(participantId => {
            if (!allDriverIds.has(participantId)) {
                missingParticipants++;
                console.warn(`⚠️ Event ${event.name} references non-existent participant: ${participantId}`);
            }
        });
    });
    
    if (missingParticipants > 0) {
        console.warn(`⚠️ Found ${missingParticipants} references to non-existent participants`);
    }
    
    // Check that all drivers have valid classes
    const driversWithoutClasses = drivers.filter(d => !d.selectedClasses || d.selectedClasses.length === 0);
    if (driversWithoutClasses.length > 0) {
        console.warn(`⚠️ Found ${driversWithoutClasses.length} drivers without classes`);
    }
    
    console.log('✅ Data integrity validation complete');
}

// Main generation function
function generateStressTestData() {
    console.log('🚀 Starting stress test data generation...');
    
    // Generate series
    console.log('📊 Generating series...');
    const series = generateSeries();
    
    // Generate events
    console.log('🏁 Generating events...');
    const events = generateEvents(series);
    
    // Generate drivers
    console.log('👥 Generating drivers...');
    const drivers = generateDrivers(events);
    
    // Update events with participants
    console.log('🔗 Linking drivers to events...');
    const updatedEvents = updateEventsWithParticipants(events, drivers);
    
    // Validate data integrity
    console.log('🔍 Validating data integrity...');
    validateDataIntegrity(series, updatedEvents, drivers);
    
    // Write data to files
    console.log('💾 Writing data to files...');
    
    // Backup existing files
    const dataDir = path.join(__dirname, 'data');
    const backupDir = path.join(__dirname, 'data', 'stress-test-backup');
    
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Backup existing data
    const filesToBackup = ['series.json', 'events.json', 'participants.json'];
    filesToBackup.forEach(file => {
        const filePath = path.join(dataDir, file);
        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, path.join(backupDir, file));
            console.log(`📋 Backed up ${file}`);
        }
    });
    
    // Write new stress test data
    fs.writeFileSync(path.join(dataDir, 'series.json'), JSON.stringify(series, null, 2));
    fs.writeFileSync(path.join(dataDir, 'events.json'), JSON.stringify(updatedEvents, null, 2));
    fs.writeFileSync(path.join(dataDir, 'participants.json'), JSON.stringify(drivers, null, 2));
    
    // Generate summary
    const summary = {
        generatedAt: new Date().toISOString(),
        seriesCount: series.length,
        eventsCount: updatedEvents.length,
        driversCount: drivers.length,
        totalParticipants: updatedEvents.reduce((sum, event) => sum + event.currentParticipants, 0),
        averageParticipantsPerEvent: Math.round(updatedEvents.reduce((sum, event) => sum + event.currentParticipants, 0) / updatedEvents.length),
        eventsWithMostParticipants: updatedEvents
            .sort((a, b) => b.currentParticipants - a.currentParticipants)
            .slice(0, 5)
            .map(e => ({ name: e.name, participants: e.currentParticipants })),
        backupLocation: backupDir
    };
    
    fs.writeFileSync(path.join(__dirname, 'stress-test-summary.json'), JSON.stringify(summary, null, 2));
    
    console.log('\n✅ Stress test data generation complete!');
    console.log('\n📈 Generated Data Summary:');
    console.log(`   Series: ${summary.seriesCount}`);
    console.log(`   Events: ${summary.eventsCount}`);
    console.log(`   Drivers: ${summary.driversCount.toLocaleString()}`);
    console.log(`   Total Participants: ${summary.totalParticipants.toLocaleString()}`);
    console.log(`   Average per Event: ${summary.averageParticipantsPerEvent}`);
    console.log(`\n📋 Backup created at: ${backupDir}`);
    console.log(`📄 Summary saved to: stress-test-summary.json`);
    
    return summary;
}

// Cleanup function to restore original data
function cleanupStressTestData() {
    console.log('🧹 Cleaning up stress test data...');
    
    const dataDir = path.join(__dirname, 'data');
    const backupDir = path.join(__dirname, 'data', 'stress-test-backup');
    
    if (fs.existsSync(backupDir)) {
        const filesToRestore = ['series.json', 'events.json', 'participants.json'];
        filesToRestore.forEach(file => {
            const backupPath = path.join(backupDir, file);
            const restorePath = path.join(dataDir, file);
            
            if (fs.existsSync(backupPath)) {
                fs.copyFileSync(backupPath, restorePath);
                console.log(`✅ Restored ${file}`);
            }
        });
        
        // Remove backup directory
        fs.rmSync(backupDir, { recursive: true, force: true });
        console.log('🗑️ Removed backup directory');
    }
    
    // Remove summary file
    const summaryPath = path.join(__dirname, 'stress-test-summary.json');
    if (fs.existsSync(summaryPath)) {
        fs.unlinkSync(summaryPath);
        console.log('🗑️ Removed summary file');
    }
    
    console.log('✅ Cleanup complete! Original data restored.');
}

// Command line interface
if (require.main === module) {
    const command = process.argv[2];
    
    switch (command) {
        case 'generate':
            generateStressTestData();
            break;
        case 'cleanup':
            cleanupStressTestData();
            break;
        default:
            console.log('Usage:');
            console.log('  node stress-test-generator.js generate  - Generate stress test data');
            console.log('  node stress-test-generator.js cleanup   - Restore original data');
            break;
    }
}

module.exports = {
    generateStressTestData,
    cleanupStressTestData,
    STRESS_TEST_CONFIG
}; 