(() => {
    'use strict';

    // Theme
    const themeBtn = document.getElementById('themeBtn');
    themeBtn.addEventListener('click', () => {
        const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = t;
        themeBtn.textContent = t === 'dark' ? '🌙' : '☀️';
    });

    // ═══════════════════════════════════════════════════
    // WMO CODE → EMOJI & DESCRIPTION
    // ═══════════════════════════════════════════════════
    const WMO = {
        0: ['☀️', 'Clear sky'], 1: ['🌤️', 'Mainly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
        45: ['🌫️', 'Foggy'], 48: ['🌫️', 'Rime fog'], 51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'],
        55: ['🌧️', 'Dense drizzle'], 61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
        71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['❄️', 'Snow grains'],
        80: ['🌦️', 'Rain showers'], 81: ['🌧️', 'Moderate showers'], 82: ['⛈️', 'Violent showers'],
        85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Heavy snow showers'],
        95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'T-storm with hail'], 99: ['⛈️', 'T-storm heavy hail'],
    };

    function getWeatherInfo(code) { return WMO[code] || ['🌡️', 'Unknown']; }

    // ═══════════════════════════════════════════════════
    // GEOCODING & WEATHER FETCH (Open-Meteo — no API key)
    // ═══════════════════════════════════════════════════
    async function geocodeCity(city) {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`);
        const data = await res.json();
        if (!data.results || data.results.length === 0) throw new Error('City not found');
        const r = data.results[0];
        return { lat: r.latitude, lon: r.longitude, name: r.name, country: r.country || '' };
    }

    async function fetchWeather(lat, lon) {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure,uv_index` +
            `&hourly=temperature_2m,weather_code,precipitation_probability` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum` +
            `&timezone=auto&forecast_days=7`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Weather API error');
        return await res.json();
    }

    async function loadWeather(city) {
        const loading = document.getElementById('loading');
        const content = document.getElementById('weatherContent');
        loading.classList.remove('hidden');
        content.classList.add('hidden');

        try {
            const geo = await geocodeCity(city);
            const data = await fetchWeather(geo.lat, geo.lon);
            renderWeather(data, geo);
            loading.classList.add('hidden');
            content.classList.remove('hidden');
        } catch (e) {
            loading.classList.add('hidden');
            alert('Could not fetch weather: ' + e.message);
        }
    }

    async function loadByCoords(lat, lon) {
        const loading = document.getElementById('loading');
        const content = document.getElementById('weatherContent');
        loading.classList.remove('hidden');
        content.classList.add('hidden');

        try {
            const data = await fetchWeather(lat, lon);
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=&count=1&language=en`).catch(() => null);
            renderWeather(data, { name: 'My Location', country: '' });
            loading.classList.add('hidden');
            content.classList.remove('hidden');
        } catch (e) {
            loading.classList.add('hidden');
            alert('Could not fetch weather: ' + e.message);
        }
    }

    // ═══════════════════════════════════════════════════
    // RENDERING
    // ═══════════════════════════════════════════════════
    function renderWeather(data, geo) {
        const c = data.current;
        const [icon, desc] = getWeatherInfo(c.weather_code);

        document.getElementById('weatherIcon').textContent = icon;
        document.getElementById('currentTemp').textContent = Math.round(c.temperature_2m);
        document.getElementById('cityName').textContent = `${geo.name}${geo.country ? ', ' + geo.country : ''}`;
        document.getElementById('weatherDesc').textContent = desc;
        document.getElementById('feelsLike').textContent = Math.round(c.apparent_temperature);
        document.getElementById('humidity').textContent = c.relative_humidity_2m + '%';
        document.getElementById('wind').textContent = Math.round(c.wind_speed_10m) + ' km/h';
        document.getElementById('pressure').textContent = Math.round(c.surface_pressure) + ' hPa';
        document.getElementById('uvIndex').textContent = c.uv_index !== undefined ? c.uv_index.toFixed(1) : '--';

        if (data.daily && data.daily.sunrise) {
            document.getElementById('sunrise').textContent = data.daily.sunrise[0].split('T')[1] || '--';
            document.getElementById('sunset').textContent = data.daily.sunset[0].split('T')[1] || '--';
        }

        // Hourly forecast (next 24h)
        if (data.hourly) {
            const hourlyEl = document.getElementById('hourlyForecast');
            const now = new Date();
            const startIdx = data.hourly.time.findIndex(t => new Date(t) >= now);
            const hours = data.hourly.time.slice(startIdx, startIdx + 24);
            hourlyEl.innerHTML = hours.map((t, i) => {
                const idx = startIdx + i;
                const [hIcon] = getWeatherInfo(data.hourly.weather_code[idx]);
                const temp = Math.round(data.hourly.temperature_2m[idx]);
                const rain = data.hourly.precipitation_probability ? data.hourly.precipitation_probability[idx] : 0;
                const time = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `<div class="hourly-item">
                    <div class="hourly-time">${time}</div>
                    <div class="hourly-icon">${hIcon}</div>
                    <div class="hourly-temp">${temp}°</div>
                    ${rain > 0 ? `<div class="hourly-rain">💧${rain}%</div>` : ''}
                </div>`;
            }).join('');
        }

        // Daily forecast
        if (data.daily) {
            const d = data.daily;
            const allMax = Math.max(...d.temperature_2m_max);
            const allMin = Math.min(...d.temperature_2m_min);
            const range = allMax - allMin || 1;

            document.getElementById('dailyForecast').innerHTML = d.time.map((t, i) => {
                const [dIcon] = getWeatherInfo(d.weather_code[i]);
                const day = new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
                const barLeft = ((d.temperature_2m_min[i] - allMin) / range) * 100;
                const barWidth = ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / range) * 100;
                return `<div class="daily-item">
                    <div class="daily-day">${i === 0 ? 'Today' : day}</div>
                    <div class="daily-icon">${dIcon}</div>
                    <div class="daily-bar"><div class="daily-bar-fill" style="margin-left:${barLeft}%;width:${barWidth}%"></div></div>
                    <div class="daily-temps"><span class="daily-low">${Math.round(d.temperature_2m_min[i])}°</span><span class="daily-high">${Math.round(d.temperature_2m_max[i])}°</span></div>
                </div>`;
            }).join('');
        }

        // Temperature chart
        drawTempChart(data);
    }

    // ═══════════════════════════════════════════════════
    // TEMPERATURE CHART (Canvas)
    // ═══════════════════════════════════════════════════
    function drawTempChart(data) {
        if (!data.hourly) return;
        const canvas = document.getElementById('tempChart');
        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const w = rect.width, h = rect.height;
        ctx.clearRect(0, 0, w, h);

        const temps = data.hourly.temperature_2m.slice(0, 48);
        const maxT = Math.max(...temps) + 2;
        const minT = Math.min(...temps) - 2;
        const range = maxT - minT || 1;
        const padL = 40, padR = 20, padT = 20, padB = 30;
        const chartW = w - padL - padR;
        const chartH = h - padT - padB;

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padT + (i / 4) * chartH;
            ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
            ctx.fillStyle = '#7a8baa';
            ctx.font = '10px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxT - (i / 4) * range) + '°', padL - 5, y + 3);
        }

        // Time labels
        ctx.fillStyle = '#7a8baa';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        for (let i = 0; i < temps.length; i += 6) {
            const x = padL + (i / (temps.length - 1)) * chartW;
            const t = new Date(data.hourly.time[i]);
            ctx.fillText(t.toLocaleTimeString([], { hour: '2-digit' }), x, h - 5);
        }

        // Gradient fill
        const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
        grad.addColorStop(0, 'rgba(59,130,246,0.3)');
        grad.addColorStop(1, 'rgba(59,130,246,0)');
        ctx.beginPath();
        ctx.moveTo(padL, h - padB);
        temps.forEach((t, i) => {
            const x = padL + (i / (temps.length - 1)) * chartW;
            const y = padT + ((maxT - t) / range) * chartH;
            ctx.lineTo(x, y);
        });
        ctx.lineTo(padL + chartW, h - padB);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        temps.forEach((t, i) => {
            const x = padL + (i / (temps.length - 1)) * chartW;
            const y = padT + ((maxT - t) / range) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Dots at 6h intervals
        for (let i = 0; i < temps.length; i += 6) {
            const x = padL + (i / (temps.length - 1)) * chartW;
            const y = padT + ((maxT - temps[i]) / range) * chartH;
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        }
    }

    // ═══════════════════════════════════════════════════
    // CONTROLS
    // ═══════════════════════════════════════════════════
    document.getElementById('searchBtn').addEventListener('click', () => {
        const city = document.getElementById('cityInput').value.trim();
        if (city) loadWeather(city);
    });

    document.getElementById('cityInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const city = e.target.value.trim();
            if (city) loadWeather(city);
        }
    });

    document.getElementById('geoBtn').addEventListener('click', () => {
        if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
        navigator.geolocation.getCurrentPosition(
            pos => loadByCoords(pos.coords.latitude, pos.coords.longitude),
            () => alert('Location access denied. Try searching for a city instead.')
        );
    });

    // Default load
    loadWeather('London');
})();
