// Resolves the backend API base URL.
// Priority: VITE_API_URL (explicit config) -> derived from the page hostname.
// Deriving from window.location.hostname means the frontend keeps working
// even when the machine's LAN IP changes (e.g. DHCP renewals).
export function getApiBase() {
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
    }
    return `http://${window.location.hostname}:8080/api`;
}

export default getApiBase;
