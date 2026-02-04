/**
 * Dashboard JavaScript functionality
 */

document.addEventListener('DOMContentLoaded', function() {
    initDropZone();
    initUploadForm();
});

/**
 * Initialize the file drop zone functionality
 */
function initDropZone() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('guideFile');
    const fileName = document.getElementById('fileName');

    if (!dropZone || !fileInput) return;

    // Handle drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Handle drag states
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, function() {
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, function() {
            dropZone.classList.remove('dragover');
        }, false);
    });

    // Handle file drop
    dropZone.addEventListener('drop', function(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            updateFileName(files[0].name);
        }
    }, false);

    // Handle file selection
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            updateFileName(this.files[0].name);
        }
    });

    function updateFileName(name) {
        if (fileName) {
            fileName.textContent = '📎 ' + name;
        }
    }
}

/**
 * Initialize upload form with AJAX submission
 */
function initUploadForm() {
    const form = document.getElementById('uploadForm');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        const originalText = submitBtn.textContent;
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Procesando...';

        try {
            const formData = new FormData(form);
            const response = await fetch('/api/process-guide', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                showToast('✅ Guía enviada exitosamente a ' + result.sentTo, 'success');
                form.reset();
                document.getElementById('fileName').textContent = '';
            } else {
                showToast('❌ ' + (result.error || result.message || 'Error al procesar la guía'), 'error');
            }
        } catch (error) {
            showToast('❌ Error de conexión: ' + error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

/**
 * Navigate to upload page with pre-selected order
 * @param {string} orderNumber - The order number to pre-select
 */
function uploadGuide(orderNumber) {
    window.location.href = '/upload?order=' + encodeURIComponent(orderNumber);
}

/**
 * Resend notification for an order
 * @param {string} orderNumber - The order number
 */
async function resendNotification(orderNumber) {
    if (!confirm('¿Reenviar notificación para el pedido ' + orderNumber + '?')) {
        return;
    }

    try {
        const response = await fetch('/api/resend-notification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ orderNumber: orderNumber })
        });

        const result = await response.json();

        if (result.success) {
            showToast('✅ Notificación reenviada exitosamente', 'success');
        } else {
            showToast('❌ ' + (result.error || 'Error al reenviar la notificación'), 'error');
        }
    } catch (error) {
        showToast('❌ Error de conexión: ' + error.message, 'error');
    }
}

/**
 * Request missing data for an order
 * @param {string} orderNumber - The order number
 */
async function requestMissingData(orderNumber) {
    const missingFields = prompt(
        'Ingrese los campos faltantes separados por coma:\n' +
        '(ej: dirección, teléfono, ciudad)'
    );

    if (!missingFields) return;

    const fields = missingFields.split(',').map(f => f.trim()).filter(f => f);

    if (fields.length === 0) {
        showToast('❌ Debe especificar al menos un campo', 'error');
        return;
    }

    try {
        const response = await fetch('/api/request-missing-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                orderNumber: orderNumber,
                missingFields: fields
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('✅ Solicitud enviada al cliente', 'success');
        } else {
            showToast('❌ ' + (result.error || 'Error al enviar la solicitud'), 'error');
        }
    } catch (error) {
        showToast('❌ Error de conexión: ' + error.message, 'error');
    }
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of toast (success, error)
 */
function showToast(message, type) {
    // Remove existing toasts
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create new toast
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || '');
    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(function() {
        toast.remove();
    }, 5000);
}

// Pre-select order if specified in URL
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderParam = urlParams.get('order');
    
    if (orderParam) {
        const orderSelect = document.getElementById('orderNumber');
        if (orderSelect) {
            orderSelect.value = orderParam;
        }
    }
});
