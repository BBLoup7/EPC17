# 🏁 EPC17 - Professional Racing Event Management System

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-2.3.3-green.svg)](https://flask.palletsprojects.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.txt)

> **EPC Technology - Project 17**  
> A comprehensive racing event management system designed for professional drag racing events with network-accessible architecture.

## 🚀 Quick Start

### Prerequisites
- Python 3.8 or higher
- Modern web browser
- Network access (for multi-computer setup)

### Installation
```bash
# Clone the repository
git clone https://github.com/your-username/EPC17.git
cd EPC17

# Install Python dependencies
pip install -r requirements.txt

# Start the server
python server.py
```

### Access the Application
- **Local Access**: `http://localhost:5000`
- **Network Access**: `http://[your-ip]:5000` (accessible from other computers)

## 🎯 Features

### 🏆 Event Management
- **Series Management**: Create and manage racing series with multiple events
- **Event Configuration**: Set up individual racing events with custom tracks and elimination types
- **Participant Registration**: Complete registration system with payment tracking
- **Advanced Pairing**: Smart bracket generation avoiding rematches and optimizing track usage

### 🏁 Race Operations
- **Bracket Generation**: Single and double elimination brackets with winner/loser paths
- **Real-time Results**: Instant race result entry and standings updates
- **Track Assignment**: Optimized track rotation to ensure fair competition
- **Live Display**: Real-time race information display for spectators

### 📊 Analytics & Reporting
- **Standings Tracking**: Real-time championship standings and points
- **Performance Analytics**: Driver statistics and performance metrics
- **Event Summaries**: Comprehensive event reports and results
- **Data Export**: Export functionality for backup and analysis

### 🌐 Network Architecture
- **Multi-Computer Access**: Centralized server accessible from multiple computers
- **Thread-Safe Operations**: Concurrent access protection for multiple users
- **Automatic Backups**: Data backup system with version control
- **Health Monitoring**: Server status and performance monitoring

## 🏗️ Architecture

### Backend (Python Flask)
```python
# Core server with REST API
server.py              # Main Flask application
requirements.txt       # Python dependencies
```

### Frontend (HTML/CSS/JavaScript)
```
js/                    # Core JavaScript modules
├── app.js            # Main application logic
├── mobile-nav.js     # Mobile navigation
└── race-ui.js        # Race interface components

modules/               # Business logic modules
├── registration.js   # Participant registration
├── series.js         # Series management
├── event.js          # Event operations
├── race.js           # Race management
└── pairing-engine.js # Advanced pairing logic

utils/                 # Utility modules
├── data-manager.js   # API client and data operations
├── event-bus.js      # Event-driven communication
├── helpers.js        # Helper functions
└── validation.js     # Form validation
```

### Data Storage
```
data/                  # JSON-based data storage
├── participants.json  # Participant registrations
├── series.json       # Racing series data
├── events.json       # Event configurations
├── races.json        # Race results and brackets
└── achievements.json # Achievement system data
```

## 🔧 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/participants` | GET/POST | Participant management |
| `/api/series` | GET/POST | Series management |
| `/api/events` | GET/POST | Event management |
| `/api/races` | GET/POST | Race results |
| `/api/standings` | GET | Calculate standings |
| `/api/health` | GET | Server health check |

## 📱 User Interface

### Modern Design
- **Responsive Layout**: Works seamlessly on desktop, tablet, and mobile
- **Clean Interface**: Professional racing event aesthetic
- **Intuitive Navigation**: Easy-to-use navigation with mobile support
- **Real-time Updates**: Live data updates without page refresh

### Key Pages
- **Home**: Application overview and quick access
- **Registration**: Participant registration and management
- **Series**: Racing series creation and management
- **Events**: Individual event setup and configuration
- **Races**: Race brackets, results, and live updates
- **Analytics**: Performance metrics and standings
- **Live Display**: Real-time race information display

## 🚀 Advanced Features

### Smart Pairing Engine
- **Rematch Avoidance**: Prevents drivers from racing the same opponent repeatedly
- **Track Optimization**: Assigns tracks based on least-used algorithm
- **Bracket Management**: Handles both single and double elimination formats
- **Fair Competition**: Ensures balanced matchups and fair racing

### Network Scalability
- **Multi-User Support**: Multiple computers can access the same event data
- **Concurrent Operations**: Thread-safe data operations for simultaneous users
- **Real-time Synchronization**: All connected computers see live updates
- **Offline Recovery**: Graceful handling of network interruptions

### Data Management
- **Automatic Backups**: Every save operation creates backup files
- **Export Functionality**: Data export for analysis and backup
- **UUID-based IDs**: Collision-free identification system
- **Validation**: Comprehensive data validation and error handling

## 🛠️ Development

### Project Structure
```
EPC17/
├── server.py              # Flask server application
├── requirements.txt       # Python dependencies
├── README.md              # This file
├── LICENSE.txt            # MIT License
├── data/                  # JSON data storage
├── modules/               # Business logic modules
├── utils/                 # Utility modules
├── components/            # Reusable UI components
├── js/                    # Core JavaScript files
├── styles/                # CSS styling
└── *.html                 # Page templates
```

### Development Setup
```bash
# Install development dependencies
pip install -r requirements.txt

# Start development server
python server.py

# Access development environment
# http://localhost:5000
```

### Code Standards
- **ES6+ JavaScript**: Modern JavaScript with modules
- **Semantic HTML5**: Accessible and semantic markup
- **CSS3**: Modern styling with responsive design
- **Python PEP 8**: Clean, readable Python code
- **API-First Design**: All data operations through REST API

## 🚨 Troubleshooting

### Common Issues

**Server won't start**
```bash
# Check Python version
python --version

# Verify dependencies
pip list | grep Flask

# Check port availability
netstat -an | grep 5000
```

**Network access not working**
- Ensure firewall allows port 5000
- Verify server starts with `host='0.0.0.0'`
- Use actual IP address from other computers

**Data not persisting**
- Check file permissions in `data/` directory
- Review server console for error messages
- Verify automatic backup files are created

## 📈 Performance

### Optimizations
- **Parallel Data Loading**: Efficient data retrieval
- **Minimal Client State**: Server-side data management
- **Caching**: Smart caching for frequently accessed data
- **Background Processing**: Non-blocking operations

### Scalability
- **Large Event Support**: Handles hundreds of participants
- **Memory Efficient**: Optimized for resource usage
- **Fast Response Times**: Quick API responses
- **Concurrent Users**: Multiple simultaneous users supported

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## 🏆 About EPC Technology

**EPC17** is developed by EPC Technology as part of Project 17, designed to revolutionize racing event management with modern technology and professional-grade features.

### Contact
- **Project**: EPC17 - Racing Event Management System
- **Company**: EPC Technology
- **Internal Name**: Project 17

---

**Ready to revolutionize your racing events?** 🏁  
Start with EPC17 today and experience professional-grade event management. 
