/**
 * App Module - Application bootstrap and initialization
 */

(function() {
    'use strict';

    /**
     * Initialize application when DOM is ready
     */
    document.addEventListener('DOMContentLoaded', () => {
        console.log('SSL Certificate Generator initializing...');

        // Initialize UI
        UI.init();

        console.log('SSL Certificate Generator ready');
    });

    /**
     * Handle page unload - clear sensitive data from memory
     */
    window.addEventListener('beforeunload', () => {
        // Clear all keys and certificates from memory
        Crypto.clearAllKeys();
        Cert.clearCertificates();
    });

})();
