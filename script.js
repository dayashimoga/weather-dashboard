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
            const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${geo.lat}&longitude=${geo.lon}&current=european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone`;
            const aqiRes = await fetch(aqiUrl).catch(() => null);
            const aqiData = aqiRes ? await aqiRes.json() : null;
            
            renderWeather(data, geo, aqiData);
            loading.classList.add('hidden');
            content.classList.remove('hidden');
            initOrUpdateMap(geo.lat, geo.lon);
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
            const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone`;
            const aqiRes = await fetch(aqiUrl).catch(() => null);
            const aqiData = aqiRes ? await aqiRes.json() : null;

            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=&count=1&language=en`).catch(() => null);
            renderWeather(data, { name: 'My Location', country: '' }, aqiData);
            loading.classList.add('hidden');
            content.classList.remove('hidden');
            initOrUpdateMap(lat, lon);
        } catch (e) {
            loading.classList.add('hidden');
            alert('Could not fetch weather: ' + e.message);
        }
    }

    // ═══════════════════════════════════════════════════
    // RENDERING
    // ═══════════════════════════════════════════════════
    function renderWeather(data, geo, aqiData) {
        const c = data.current;
        const [icon, desc] = getWeatherInfo(c.weather_code);
        renderDynamicBackground(c.weather_code);

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

        // Render Air Quality
        if(aqiData && aqiData.current) {
            renderAQI(aqiData);
        }
    }

    function renderAQI(aqiData) {
        const c = aqiData.current;
        if(!c) return;
        
        const aqi = c.european_aqi;
        let aqiText = "Good", aqiColor = "#10b981", advice = "Air quality is ideal for outdoor activities.";
        if(aqi > 40) { aqiText = "Fair"; aqiColor = "#facc15"; advice = "Air quality is acceptable; sensitive individuals should consider limiting prolonged outdoor exertion."; }
        if(aqi > 60) { aqiText = "Moderate"; aqiColor = "#f97316"; advice = "Members of sensitive groups may experience health effects. The general public is not likely to be affected."; }
        if(aqi > 80) { aqiText = "Poor"; aqiColor = "#ef4444"; advice = "Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects."; }
        if(aqi > 100) { aqiText = "Very Poor"; aqiColor = "#991b1b"; advice = "Health warnings of emergency conditions. The entire population is more likely to be affected."; }

        document.getElementById('aqiData').innerHTML = `
            <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:6px;border-left:3px solid ${aqiColor}">
                <div style="font-size:0.7rem;color:var(--text-muted)">AQI (EU)</div>
                <div style="font-size:1.2rem;font-weight:bold;color:${aqiColor}">${aqi} - ${aqiText}</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:6px;">
                <div style="font-size:0.7rem;color:var(--text-muted)">PM2.5</div>
                <div style="font-size:1.1rem;font-weight:bold;">${c.pm2_5 || 0} μg/m³</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:6px;">
                <div style="font-size:0.7rem;color:var(--text-muted)">PM10</div>
                <div style="font-size:1.1rem;font-weight:bold;">${c.pm10 || 0} μg/m³</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:6px;">
                <div style="font-size:0.7rem;color:var(--text-muted)">Ozone (O3)</div>
                <div style="font-size:1.1rem;font-weight:bold;">${c.ozone || 0} μg/m³</div>
            </div>
        `;
        document.getElementById('healthAdvice').innerHTML = `<strong>Health Advice:</strong> ${advice}`;
    }

    // ═══════════════════════════════════════════════════
    // LEAFLET RADAR MAP
    // ═══════════════════════════════════════════════════
    let radarMap = null;
    let radarLayer = null;

    async function initOrUpdateMap(lat, lon) {
        if (!radarMap) {
            radarMap = L.map('radarMap').setView([lat, lon], 6);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; CartoDB',
                maxZoom: 18
            }).addTo(radarMap);
            
            try {
                const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
                const rvData = await res.json();
                if(rvData.radar && rvData.radar.past && rvData.radar.past.length > 0) {
                    const latestFrame = rvData.radar.past[rvData.radar.past.length - 1].time;
                    radarLayer = L.tileLayer(`https://tilecache.rainviewer.com/v2/radar/${latestFrame}/256/{z}/{x}/{y}/2/1_1.png`, {
                        opacity: 0.7,
                        transparent: true
                    }).addTo(radarMap);
                }
            } catch(e) { console.error("Radar error:", e); }
        } else {
            radarMap.setView([lat, lon], 6);
        }
        
        if(radarMap.marker) radarMap.removeLayer(radarMap.marker);
        radarMap.marker = L.marker([lat, lon]).addTo(radarMap);
        
        // Fix Leaflet container sizing issue in flex/grid
        setTimeout(() => radarMap.invalidateSize(), 500);
    }

    // ═══════════════════════════════════════════════════
    // TEMPERATURE CHART (Chart.js)
    // ═══════════════════════════════════════════════════
    let tempChartInstance = null;
    function drawTempChart(data) {
        if (!data.hourly) return;
        const canvas = document.getElementById('tempChart');
        const ctx = canvas.getContext('2d');

        if (tempChartInstance) tempChartInstance.destroy();

        const hours48 = data.hourly.time.slice(0, 48);
        const temps = data.hourly.temperature_2m.slice(0, 48);
        const precip = data.hourly.precipitation ? data.hourly.precipitation.slice(0, 48) : new Array(48).fill(0);
        const labels = hours48.map(t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        tempChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Temperature (°C)',
                        data: temps,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.15)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: '#3b82f6',
                        borderWidth: 2.5,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Precipitation (mm)',
                        data: precip,
                        type: 'bar',
                        backgroundColor: 'rgba(99,102,241,0.35)',
                        borderColor: 'rgba(99,102,241,0.6)',
                        borderWidth: 1,
                        borderRadius: 3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                animation: { duration: 900, easing: 'easeInOutQuart' },
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, usePointStyle: true, padding: 18 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.9)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(99,102,241,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        titleFont: { family: 'Inter', weight: '600' },
                        bodyFont: { family: 'JetBrains Mono', size: 12 }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#64748b', font: { family: 'Inter', size: 10 }, maxRotation: 45, maxTicksLimit: 12 },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        position: 'left',
                        ticks: { color: '#3b82f6', font: { family: 'JetBrains Mono', size: 10 }, callback: v => v + '°' },
                        grid: { color: 'rgba(255,255,255,0.04)' },
                        title: { display: true, text: 'Temp (°C)', color: '#64748b', font: { size: 10 } }
                    },
                    y1: {
                        position: 'right',
                        beginAtZero: true,
                        ticks: { color: '#6366f1', font: { family: 'JetBrains Mono', size: 10 }, callback: v => v + 'mm' },
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Precip (mm)', color: '#64748b', font: { size: 10 } }
                    }
                }
            }
        });
    }

    // ═══════════════════════════════════════════════════
    // DYNAMIC BACKGROUND CANVAS
    // ═══════════════════════════════════════════════════
    let bgAnimationId;
    function renderDynamicBackground(weatherCode) {
        const canvas = document.getElementById('bgCanvas');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        if(bgAnimationId) cancelAnimationFrame(bgAnimationId);
        
        const particles = [];
        let type = 'none';
        
        if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(weatherCode)) type = 'rain';
        if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) type = 'snow';
        if ([2, 3, 45, 48].includes(weatherCode)) type = 'clouds';

        if (type === 'rain') {
            for(let i=0; i<150; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, l: Math.random()*20+10, v: Math.random()*15+10 });
        } else if (type === 'snow') {
            for(let i=0; i<200; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*3+1, v: Math.random()*2+1, vx: (Math.random()-0.5)*2 });
        } else if (type === 'clouds') {
            for(let i=0; i<8; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*(canvas.height/2), r: Math.random()*150+50, v: Math.random()*0.5+0.1 });
        }
        
        function draw() {
            ctx.clearRect(0,0, canvas.width, canvas.height);
            
            if(type === 'rain') {
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                particles.forEach(p => {
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x + p.v*0.1, p.y + p.l);
                    p.x += p.v*0.1;
                    p.y += p.v;
                    if(p.y > canvas.height) { p.y = -20; p.x = Math.random()*canvas.width; }
                });
                ctx.stroke();
            } else if(type === 'snow') {
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.beginPath();
                particles.forEach(p => {
                    ctx.moveTo(p.x, p.y);
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
                    p.y += p.v;
                    p.x += p.vx;
                    if(p.y > canvas.height) { p.y = -10; p.x = Math.random()*canvas.width; }
                });
                ctx.fill();
            } else if (type === 'clouds') {
                ctx.fillStyle = 'rgba(255,255,255,0.03)';
                particles.forEach(p => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
                    ctx.fill();
                    p.x += p.v;
                    if(p.x - p.r > canvas.width) { p.x = -p.r; }
                });
            }
            
            bgAnimationId = requestAnimationFrame(draw);
        }
        if(type !== 'none') draw();
        else ctx.clearRect(0,0, canvas.width, canvas.height);
    }
    
    window.addEventListener('resize', () => {
        const c = document.getElementById('bgCanvas');
        if(c) { c.width = window.innerWidth; c.height = window.innerHeight; }
    });

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
