/**
 * PDF Generator Utility for EPC17 Event Management System
 * Generates clean, professional PDF documents with driver statistics
 * Uses jsPDF with autoTable for proper table rendering (not screenshots)
 */

class PDFGenerator {
    constructor() {
        this.jsPDF = null;
        this.defaultOptions = {
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            margins: { top: 20, bottom: 20, left: 15, right: 15 }
        };
        
        console.log('📄 PDFGenerator initialized');
    }

    /**
     * Ensure jsPDF is loaded
     */
    async ensureJsPDF() {
        if (window.jspdf && window.jspdf.jsPDF) {
            this.jsPDF = window.jspdf.jsPDF;
            return true;
        }
        throw new Error('jsPDF library not loaded. Please include jsPDF in your HTML.');
    }

    /**
     * Generate PDF for a single driver's stats
     * @param {Object} driverData - Driver data with stats
     * @param {Object} eventData - Event information
     * @returns {Blob} PDF blob
     */
    async generateDriverStatsPDF(driverData, eventData) {
        await this.ensureJsPDF();
        
        // Create new PDF document
        const doc = new this.jsPDF(this.defaultOptions);
        const pageWidth = doc.internal.pageSize.getWidth();
        const margins = this.defaultOptions.margins;
        
        // Add header
        this.addHeader(doc, pageWidth, margins);
        
        // Add event information
        let yPosition = this.addEventInfo(doc, eventData, margins);
        
        // Add driver information
        yPosition = this.addDriverInfo(doc, driverData, yPosition, margins);
        
        // Add statistics table
        yPosition = this.addStatsTable(doc, driverData, yPosition, margins);
        
        // Add lane performance if available
        if (driverData.lanePerformance && Object.keys(driverData.lanePerformance).length > 0) {
            yPosition = this.addLanePerformance(doc, driverData, yPosition, margins);
        }
        
        // Add footer
        this.addFooter(doc);
        
        return doc;
    }

    /**
     * Add document header
     */
    addHeader(doc, pageWidth, margins) {
        // Logo/Title
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 140, 66); // EPC Orange
        doc.text('EPC TECHNOLOGY', margins.left, margins.top);
        
        // Subtitle
        doc.setFontSize(14);
        doc.setTextColor(60, 60, 60);
        doc.text('Event Performance Report', margins.left, margins.top + 7);
        
        // Divider line
        doc.setDrawColor(255, 140, 66);
        doc.setLineWidth(0.5);
        doc.line(margins.left, margins.top + 10, pageWidth - margins.right, margins.top + 10);
    }

    /**
     * Add event information
     */
    addEventInfo(doc, eventData, margins) {
        let y = margins.top + 20;
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 40, 40);
        doc.text('Event Information', margins.left, y);
        
        y += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        
        const eventInfo = [
            `Event: ${eventData.name || 'N/A'}`,
            `Date: ${eventData.date ? new Date(eventData.date).toLocaleDateString() : 'N/A'}`,
            `Location: ${eventData.location || 'N/A'}`,
            `Status: ${eventData.status || 'N/A'}`
        ];
        
        eventInfo.forEach(line => {
            doc.text(line, margins.left, y);
            y += 5;
        });
        
        return y + 5;
    }

    /**
     * Add driver information
     */
    addDriverInfo(doc, driverData, yPosition, margins) {
        let y = yPosition;
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 40, 40);
        doc.text('Driver Information', margins.left, y);
        
        y += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        
        const driverInfo = [
            `Name: ${driverData.name || 'N/A'}`,
            `Classes: ${driverData.classes || 'N/A'}`,
            `Email: ${driverData.email || 'Not provided'}`
        ];
        
        driverInfo.forEach(line => {
            doc.text(line, margins.left, y);
            y += 5;
        });
        
        return y + 8;
    }

    /**
     * Add statistics table
     */
    addStatsTable(doc, driverData, yPosition, margins) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 40, 40);
        doc.text('Performance Statistics', margins.left, yPosition);
        
        // Create table data
        const tableData = [
            ['Total Races', driverData.races || 0],
            ['Wins', driverData.wins || 0],
            ['Win Percentage', `${driverData.winRate || 0}%`],
            ['Average Position', driverData.avgPosition?.toFixed(2) || 'N/A']
        ];
        
        // Draw table using simple manual approach (since autoTable may not be loaded)
        let y = yPosition + 7;
        const colWidth = 85;
        const rowHeight = 8;
        
        doc.setFillColor(255, 140, 66);
        doc.rect(margins.left, y, colWidth * 2, rowHeight, 'F');
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('Metric', margins.left + 2, y + 5);
        doc.text('Value', margins.left + colWidth + 2, y + 5);
        
        y += rowHeight;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        
        tableData.forEach((row, index) => {
            // Alternate row colors
            if (index % 2 === 0) {
                doc.setFillColor(245, 245, 245);
                doc.rect(margins.left, y, colWidth * 2, rowHeight, 'F');
            }
            
            doc.text(row[0], margins.left + 2, y + 5);
            doc.text(String(row[1]), margins.left + colWidth + 2, y + 5);
            y += rowHeight;
        });
        
        // Border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.rect(margins.left, yPosition + 7, colWidth * 2, rowHeight * (tableData.length + 1));
        
        return y + 5;
    }

    /**
     * Add lane performance table
     */
    addLanePerformance(doc, driverData, yPosition, margins) {
        let y = yPosition;
        
        // Check if we need a new page
        if (y > 220) {
            doc.addPage();
            y = margins.top;
        }
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 40, 40);
        doc.text('Lane Performance', margins.left, y);
        
        y += 7;
        
        const laneData = Object.entries(driverData.lanePerformance).map(([lane, stats]) => [
            `Lane ${lane}`,
            stats.total || 0,
            stats.wins || 0,
            `${stats.winRate?.toFixed(1) || 0}%`
        ]);
        
        // Table headers
        const colWidth = 42.5;
        const rowHeight = 8;
        
        doc.setFillColor(255, 140, 66);
        doc.rect(margins.left, y, colWidth * 4, rowHeight, 'F');
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('Lane', margins.left + 2, y + 5);
        doc.text('Races', margins.left + colWidth + 2, y + 5);
        doc.text('Wins', margins.left + colWidth * 2 + 2, y + 5);
        doc.text('Win %', margins.left + colWidth * 3 + 2, y + 5);
        
        y += rowHeight;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        
        laneData.forEach((row, index) => {
            if (index % 2 === 0) {
                doc.setFillColor(245, 245, 245);
                doc.rect(margins.left, y, colWidth * 4, rowHeight, 'F');
            }
            
            doc.text(row[0], margins.left + 2, y + 5);
            doc.text(String(row[1]), margins.left + colWidth + 2, y + 5);
            doc.text(String(row[2]), margins.left + colWidth * 2 + 2, y + 5);
            doc.text(String(row[3]), margins.left + colWidth * 3 + 2, y + 5);
            y += rowHeight;
        });
        
        // Border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.rect(margins.left, yPosition + 7, colWidth * 4, rowHeight * (laneData.length + 1));
        
        return y + 5;
    }

    /**
     * Add footer
     */
    addFooter(doc) {
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(120, 120, 120);
        
        const footerText = `Generated on ${new Date().toLocaleString()} | EPC Technology Event Management System`;
        const textWidth = doc.getTextWidth(footerText);
        doc.text(footerText, (pageWidth - textWidth) / 2, pageHeight - 10);
    }

    /**
     * Generate PDFs for multiple drivers
     * @param {Array} driversData - Array of driver data objects
     * @param {Object} eventData - Event information
     * @returns {Array} Array of {driverId, driverName, pdf, blob}
     */
    async generateBulkDriverStatsPDFs(driversData, eventData) {
        const results = [];
        
        for (const driverData of driversData) {
            try {
                const doc = await this.generateDriverStatsPDF(driverData, eventData);
                const blob = doc.output('blob');
                const fileName = `${driverData.name.replace(/[^a-zA-Z0-9]/g, '_')}_stats.pdf`;
                
                results.push({
                    driverId: driverData.id,
                    driverName: driverData.name,
                    email: driverData.email,
                    pdf: doc,
                    blob: blob,
                    fileName: fileName
                });
                
                console.log(`✅ Generated PDF for ${driverData.name}`);
            } catch (error) {
                console.error(`❌ Failed to generate PDF for ${driverData.name}:`, error);
                results.push({
                    driverId: driverData.id,
                    driverName: driverData.name,
                    email: driverData.email,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * Download a PDF document
     */
    downloadPDF(doc, fileName) {
        doc.save(fileName);
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.PDFGenerator = PDFGenerator;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFGenerator;
}

