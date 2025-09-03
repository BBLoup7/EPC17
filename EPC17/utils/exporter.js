/*
 * Export utilities for EPC17
 * Provides client-side export of DOM content to PDF/PNG/JPEG and CSV for tables.
 * Depends on html2canvas and jsPDF (UMD build) when exporting images/PDF.
 */

(function(global) {
  async function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load script: ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureDepsLoaded() {
    // html2canvas
    if (typeof global.html2canvas === 'undefined') {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
      } catch (e) {
        notify('Failed to load html2canvas. Check your internet connection.', 'error');
        throw e;
      }
    }
    // jsPDF
    if (!global.jspdf || !global.jspdf.jsPDF) {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
      } catch (e) {
        notify('Failed to load jsPDF. Check your internet connection.', 'error');
        throw e;
      }
    }
  }

  function notify(message, type) {
    if (global.Helpers && typeof global.Helpers.showToast === 'function') {
      global.Helpers.showToast(message, type === 'error' ? 'error' : 'info');
    } else if (global.showToast) {
      try { global.showToast(message, type || 'info'); } catch (_) {}
    } else {
      console[type === 'error' ? 'error' : 'log'](message);
    }
  }

  const ExportUtils = {
    ensureDependencies: ensureDepsLoaded,
    async exportElementAsPNG(element, fileName = 'export.png', scale = 2) {
      await ensureDepsLoaded();
      const el = resolveElement(element);
      if (!el) return;
      const canvas = await html2canvas(el, {
        scale: scale,
        useCORS: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff'
      });
      const dataUrl = canvas.toDataURL('image/png');
      triggerDownload(dataUrl, fileName);
    },

    async exportElementAsJPEG(element, fileName = 'export.jpg', quality = 0.92, scale = 2) {
      await ensureDepsLoaded();
      const el = resolveElement(element);
      if (!el) return;
      const canvas = await html2canvas(el, {
        scale: scale,
        useCORS: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff'
      });
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      triggerDownload(dataUrl, fileName);
    },

    async exportElementAsPDF(element, fileName = 'export.pdf', options = {}) {
      await ensureDepsLoaded();
      const el = resolveElement(element);
      if (!el) return;

      const {
        orientation = 'p',
        unit = 'mm',
        format = 'a4',
        scale = 2,
        marginMm = 5
      } = options;

      if (!window.jspdf || !window.jspdf.jsPDF) {
        console.error('jsPDF not found. Falling back to window.print().');
        try { window.print(); } catch (_) {}
        return;
      }

      const canvas = await html2canvas(el, {
        scale: scale,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new window.jspdf.jsPDF({ orientation, unit, format });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imageProps = pdf.getImageProperties(imgData);
      const printableWidth = pageWidth - marginMm * 2;
      const imgWidth = printableWidth;
      const imgHeight = (imageProps.height * imgWidth) / imageProps.width;

      let position = marginMm;
      let heightLeft = imgHeight;

      pdf.addImage(imgData, 'PNG', marginMm, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - marginMm * 2);

      while (heightLeft > 0) {
        pdf.addPage();
        position = marginMm - (imgHeight - heightLeft);
        pdf.addImage(imgData, 'PNG', marginMm, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - marginMm * 2);
      }

      pdf.save(fileName);
    },

    exportTableAsCSV(tableElement, fileName = 'table.csv') {
      const table = resolveElement(tableElement);
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tr'));
      const csv = rows
        .map((row) =>
          Array.from(row.querySelectorAll('th,td'))
            .map((cell) => sanitizeCSV(cell.innerText))
            .join(',')
        )
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, fileName, true);
    },

    exportElementAsHTML(element, fileName = 'export.html') {
      const el = resolveElement(element);
      if (!el) return;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
        document.title
      )}</title></head><body>${el.outerHTML}</body></html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, fileName, true);
    },

    defaultFileName(prefix = 'export') {
      const ts = new Date()
        .toISOString()
        .replace(/[:T]/g, '-')
        .replace(/\..+/, '');
      return `${prefix}-${ts}`;
    }
  };

  function resolveElement(element) {
    if (!element) return null;
    if (element instanceof Element) return element;
    if (typeof element === 'string') return document.querySelector(element);
    return null;
  }

  function triggerDownload(urlOrDataUrl, fileName, revokeAfter = false) {
    const link = document.createElement('a');
    link.href = urlOrDataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (revokeAfter) {
      setTimeout(() => URL.revokeObjectURL(urlOrDataUrl), 1000);
    }
  }

  function sanitizeCSV(value) {
    if (value == null) return '';
    const str = String(value).replace(/\r?\n|\r/g, ' ').trim();
    // Escape quotes and wrap in quotes if contains comma or quote
    const escaped = str.replace(/"/g, '""');
    if (/[",]/.test(escaped)) {
      return `"${escaped}"`;
    }
    return escaped;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  global.ExportUtils = ExportUtils;
})(window);


