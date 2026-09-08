/* ============================================================
   BASIC PLANNER
   JavaScript
   ============================================================ */


/* ------------------------------------------------------------
   CONFIGURATION
------------------------------------------------------------ */

const CLIENT_ID = "447137088453-s4fkui7elp95qt77i6fl92ctpi5bv1qm.apps.googleusercontent.com";

const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest";

const SCOPES =
  "https://www.googleapis.com/auth/calendar.readonly";


/* ------------------------------------------------------------
   STATE
------------------------------------------------------------ */

let tokenClient = null;
let gapiReady = false;
let gisReady = false;
let accessToken = null;

let calendars = [];
let selectedCalendarId = "primary";

let weatherData = null;
let weatherLocation = null;

window.currentEvents = [];


/* ------------------------------------------------------------
   INITIALIZATION
------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {

  const today = new Date();

  document.getElementById("datePicker").value =
    formatDateInput(today);

  const savedZip =
    localStorage.getItem("basicPlannerZip");

  if (savedZip) {
    document.getElementById("zipCode").value =
      savedZip;
  }

  renderPlanner();

  waitForGoogleLibraries();

  document
    .getElementById("datePicker")
    .addEventListener("change", async () => {

      renderPlanner();

      if (accessToken) {
        await loadCalendarEvents();
      }
    });
});


function waitForGoogleLibraries() {

  if (window.gapi && window.google) {
    initializeGoogle();
    return;
  }

  setTimeout(waitForGoogleLibraries, 100);
}


async function initializeGoogle() {

  if (!window.gapi || !window.google) {
    return;
  }

  if (!gapiReady) {

    await new Promise(resolve => {

      gapi.load("client", async () => {

        await gapi.client.init({
          discoveryDocs: [DISCOVERY_DOC]
        });

        gapiReady = true;

        resolve();
      });
    });
  }

  if (!gisReady) {

    tokenClient =
      google.accounts.oauth2.initTokenClient({

        client_id: CLIENT_ID,

        scope: SCOPES,

        callback: response => {

          if (response.error) {

            showStatus(
              "Google authorization failed: " +
              response.error,
              true
            );

            return;
          }

          accessToken =
            response.access_token;

          gapi.client.setToken({
            access_token: accessToken
          });

          onGoogleConnected();
        }
      });

    gisReady = true;
  }
}


/* ------------------------------------------------------------
   GOOGLE CALENDAR AUTHENTICATION
------------------------------------------------------------ */

function connectGoogleCalendar() {

  if (CLIENT_ID.includes("YOUR_GOOGLE")) {

    alert(
      "First replace CLIENT_ID in script.js with your Google OAuth Web Client ID."
    );

    return;
  }

  if (!gisReady) {

    showStatus(
      "Google services are still loading. Try again in a moment.",
      true
    );

    return;
  }

  tokenClient.requestAccessToken({
    prompt: accessToken ? "" : "consent"
  });
}


async function onGoogleConnected() {

  document.getElementById(
    "connectButton"
  ).style.display = "none";

  document.getElementById(
    "disconnectButton"
  ).style.display = "inline-block";

  document.getElementById(
    "statusDot"
  ).classList.add("connected");

  document.getElementById(
    "calendarStatus"
  ).textContent =
    "Google Calendar connected";

  try {

    await loadCalendars();

    await loadCalendarEvents();

  } catch (error) {

    console.error(error);

    showStatus(
      "Connected to Google, but the calendar could not be loaded.",
      true
    );
  }
}


function disconnectGoogleCalendar() {

  if (
    accessToken &&
    google.accounts &&
    google.accounts.oauth2
  ) {

    google.accounts.oauth2.revoke(
      accessToken,
      () => {}
    );
  }

  accessToken = null;

  if (window.gapi && gapi.client) {
    gapi.client.setToken(null);
  }

  calendars = [];

  window.currentEvents = [];

  document.getElementById(
    "calendarSelectorGroup"
  ).style.display = "none";

  document.getElementById(
    "connectButton"
  ).style.display = "inline-block";

  document.getElementById(
    "disconnectButton"
  ).style.display = "none";

  document.getElementById(
    "statusDot"
  ).classList.remove("connected");

  document.getElementById(
    "calendarStatus"
  ).textContent =
    "Calendar not connected";

  renderPlanner();

  showStatus(
    "Google Calendar disconnected."
  );
}


/* ------------------------------------------------------------
   CALENDAR LIST
------------------------------------------------------------ */

async function loadCalendars() {

  const response =
    await gapi.client.calendar.calendarList.list({

      minAccessRole: "reader",

      showDeleted: false
    });

  calendars =
    response.result.items || [];

  const selector =
    document.getElementById(
      "calendarSelector"
    );

  selector.innerHTML = "";

  calendars.forEach(calendar => {

    const option =
      document.createElement("option");

    option.value =
      calendar.id;

    option.textContent =
      calendar.summaryOverride ||
      calendar.summary ||
      calendar.id;

    if (calendar.primary) {

      option.selected = true;

      selectedCalendarId =
        calendar.id;
    }

    selector.appendChild(option);
  });

  if (calendars.length) {

    document.getElementById(
      "calendarSelectorGroup"
    ).style.display = "flex";
  }
}


function calendarChanged() {

  selectedCalendarId =
    document.getElementById(
      "calendarSelector"
    ).value;

  loadCalendarEvents();
}


/* ------------------------------------------------------------
   CALENDAR EVENTS
------------------------------------------------------------ */

async function loadCalendarEvents() {

  if (!accessToken) {

    renderPlanner();

    return;
  }

  const date =
    document.getElementById(
      "datePicker"
    ).value;

  if (!date) {
    return;
  }

  const start =
    new Date(date + "T00:00:00");

  const end =
    new Date(start);

  end.setDate(
    end.getDate() + 1
  );

  showStatus(
    "Loading calendar events..."
  );

  try {

    const response =
      await gapi.client.calendar.events.list({

        calendarId:
          selectedCalendarId,

        timeMin:
          start.toISOString(),

        timeMax:
          end.toISOString(),

        singleEvents:
          true,

        orderBy:
          "startTime",

        showDeleted:
          false,

        maxResults:
          250
      });

    const events =
      response.result.items || [];

    window.currentEvents =
      events;

    renderPlanner();

    showStatus(
      `${events.length} calendar event${
        events.length === 1 ? "" : "s"
      } loaded.`,
      false,
      true
    );

  } catch (error) {

    console.error(error);

    if (
      error.status === 401 ||
      error.result?.error?.code === 401
    ) {

      accessToken = null;

      showStatus(
        "Your Google authorization expired. Please reconnect.",
        true
      );

      return;
    }

    showStatus(
      "Unable to load calendar events.",
      true
    );
  }
}


/* ------------------------------------------------------------
   WEATHER
------------------------------------------------------------ */

async function loadWeather() {

  const zip =
    document.getElementById(
      "zipCode"
    ).value.trim();

  if (!zip) {

    showStatus(
      "Please enter a ZIP code.",
      true
    );

    return;
  }

  localStorage.setItem(
    "basicPlannerZip",
    zip
  );

  showStatus(
    "Finding ZIP code..."
  );

  try {

    const geoUrl =
      "https://geocoding-api.open-meteo.com/v1/search?" +
      new URLSearchParams({

        name: zip,

        count: 1,

        language: "en",

        format: "json"
      });

    const geoResponse =
      await fetch(geoUrl);

    if (!geoResponse.ok) {

      throw new Error(
        "Geocoding request failed."
      );
    }

    const geo =
      await geoResponse.json();

    if (
      !geo.results ||
      !geo.results.length
    ) {

      throw new Error(
        "ZIP code could not be located."
      );
    }

    const location =
      geo.results[0];

    weatherLocation =
      location;

    showStatus(
      `Loading weather for ${
        location.name
      }, ${
        location.admin1 || ""
      }...`
    );

    const weatherUrl =
      "https://api.open-meteo.com/v1/forecast?" +
      new URLSearchParams({

        latitude:
          location.latitude,

        longitude:
          location.longitude,

        hourly: [
          "temperature_2m",
          "apparent_temperature",
          "precipitation_probability",
          "weather_code",
          "wind_speed_10m"
        ].join(","),

        temperature_unit:
          "fahrenheit",

        wind_speed_unit:
          "mph",

        timezone:
          "auto",

        forecast_days:
          7
      });

    const weatherResponse =
      await fetch(weatherUrl);

    if (!weatherResponse.ok) {

      throw new Error(
        "Weather request failed."
      );
    }

    weatherData =
      await weatherResponse.json();

    renderPlanner();

    showStatus(
      `Weather loaded for ${
        location.name
      }, ${
        location.admin1 || ""
      }.`,
      false,
      true
    );

  } catch (error) {

    console.error(error);

    showStatus(
      error.message ||
      "Unable to load weather.",
      true
    );
  }
}


/* ------------------------------------------------------------
   WEATHER HELPERS
------------------------------------------------------------ */

function weatherForHour(date) {

  if (
    !weatherData ||
    !weatherData.hourly
  ) {

    return null;
  }

  const target =
    formatLocalWeatherDate(date);

  const index =
    weatherData.hourly.time.findIndex(
      time => time.startsWith(target)
    );

  if (index === -1) {
    return null;
  }

  return {

    temperature:
      weatherData.hourly.temperature_2m[index],

    apparent:
      weatherData.hourly.apparent_temperature[index],

    precipitation:
      weatherData.hourly.precipitation_probability[index],

    code:
      weatherData.hourly.weather_code[index],

    wind:
      weatherData.hourly.wind_speed_10m[index]
  };
}


function weatherIcon(code) {

  if (code === 0)
    return "☀️";

  if ([1, 2, 3].includes(code))
    return "🌤️";

  if ([45, 48].includes(code))
    return "🌫️";

  if (
    [51, 53, 55, 56, 57]
      .includes(code)
  )
    return "🌦️";

  if (
    [61, 63, 65, 66, 67]
      .includes(code)
  )
    return "🌧️";

  if (
    [71, 73, 75, 77]
      .includes(code)
  )
    return "🌨️";

  if (
    [80, 81, 82]
      .includes(code)
  )
    return "🌦️";

  if (
    [85, 86]
      .includes(code)
  )
    return "🌨️";

  if (
    [95, 96, 99]
      .includes(code)
  )
    return "⛈️";

  return "🌡️";
}


function weatherDescription(code) {

  const descriptions = {

    0: "Clear",

    1: "Mostly clear",

    2: "Partly cloudy",

    3: "Overcast",

    45: "Foggy",

    48: "Foggy",

    51: "Light drizzle",

    53: "Drizzle",

    55: "Heavy drizzle",

    56: "Freezing drizzle",

    57: "Freezing drizzle",

    61: "Light rain",

    63: "Rain",

    65: "Heavy rain",

    66: "Freezing rain",

    67: "Freezing rain",

    71: "Light snow",

    73: "Snow",

    75: "Heavy snow",

    77: "Snow grains",

    80: "Rain showers",

    81: "Rain showers",

    82: "Heavy showers",

    85: "Snow showers",

    86: "Snow showers",

    95: "Thunderstorm",

    96: "Thunderstorm",

    99: "Thunderstorm"
  };

  return descriptions[code] ||
    "Unknown";
}


/* ------------------------------------------------------------
   PLANNER RENDERING
------------------------------------------------------------ */

function renderPlanner() {

  const container =
    document.getElementById(
      "plannerRows"
    );

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const dateString =
    document.getElementById(
      "datePicker"
    ).value;

  if (!dateString) {
    return;
  }

  const selectedDate =
    new Date(
      dateString + "T00:00:00"
    );

  const events =
    window.currentEvents || [];

  /*
    Display all 24 hours.
    One row = one hour.
  */

  for (
    let hour = 0;
    hour < 24;
    hour++
  ) {

    const row =
      document.createElement("div");

    row.className =
      "hour-row";

    const hourDate =
      new Date(selectedDate);

    hourDate.setHours(
      hour,
      0,
      0,
      0
    );

    if (
      isCurrentHour(hourDate)
    ) {

      row.classList.add(
        "current-hour"
      );
    }


    /* ---------------- TIME ---------------- */

    const timeCell =
      document.createElement("div");

    timeCell.className =
      "hour-cell";

    timeCell.innerHTML = `

      <div class="time">
        ${formatHour(hour)}
      </div>

      <div class="time-sub">
        ${
          hour === 0
            ? "Midnight"
            : hour === 12
              ? "Noon"
              : hour < 12
                ? "Morning"
                : "Afternoon / evening"
        }
      </div>

      ${
        isCurrentHour(hourDate)
          ? `<div class="now-badge">Now</div>`
          : ""
      }

    `;


    /* ---------------- WEATHER ---------------- */

    const weatherCell =
      document.createElement("div");

    weatherCell.className =
      "hour-cell";

    const weather =
      weatherForHour(hourDate);

    if (weather) {

      weatherCell.innerHTML = `

        <div class="weather">

          <div class="weather-icon">
            ${weatherIcon(weather.code)}
          </div>

          <div>

            <div class="weather-temp">
              ${Math.round(
                weather.temperature
              )}°F
            </div>

            <div class="weather-desc">
              ${weatherDescription(
                weather.code
              )}
            </div>

            <div class="weather-extra">
              Feels ${
                Math.round(
                  weather.apparent
                )
              }° ·
              ${
                weather.precipitation
              }% rain ·
              ${
                Math.round(
                  weather.wind
                )
              } mph wind
            </div>

          </div>

        </div>

      `;

    } else {

      weatherCell.innerHTML = `

        <div class="weather-loading">

          ${
            weatherData
              ? "No forecast available"
              : "Enter ZIP for weather"
          }

        </div>

      `;
    }


    /* ---------------- CALENDAR ---------------- */

    const planCell =
      document.createElement("div");

    planCell.className =
      "hour-cell";

    const matchingEvents =
      getEventsForHour(
        events,
        hourDate
      );

    if (
      !matchingEvents.length
    ) {

      planCell.innerHTML =
        `<div class="no-events">
          No plans
        </div>`;

    } else {

      matchingEvents.forEach(
        event => {

          const eventElement =
            createEventElement(
              event
            );

          planCell.appendChild(
            eventElement
          );
        }
      );
    }


    row.appendChild(
      timeCell
    );

    row.appendChild(
      weatherCell
    );

    row.appendChild(
      planCell
    );

    container.appendChild(
      row
    );
  }
}


/* ------------------------------------------------------------
   CALENDAR EVENT HELPERS
------------------------------------------------------------ */

function getEventsForHour(
  events,
  hourDate
) {

  const hourStart =
    new Date(hourDate);

  const hourEnd =
    new Date(hourDate);

  hourEnd.setHours(
    hourEnd.getHours() + 1
  );

  return events.filter(
    event => {

      /*
        All-day events.
      */

      if (event.start?.date) {

        const day =
          event.start.date;

        return (
          day ===
          document.getElementById(
            "datePicker"
          ).value
        );
      }

      if (
        !event.start?.dateTime ||
        !event.end?.dateTime
      ) {

        return false;
      }

      const start =
        new Date(
          event.start.dateTime
        );

      const end =
        new Date(
          event.end.dateTime
        );

      return (
        start < hourEnd &&
        end > hourStart
      );
    }
  );
}


function createEventElement(event) {

  const element =
    document.createElement("div");

  const isAllDay =
    !!event.start?.date;

  element.className =
    "event" +
    (
      isAllDay
        ? " all-day"
        : ""
    );

  let timeText =
    "All day";

  if (!isAllDay) {

    const start =
      new Date(
        event.start.dateTime
      );

    const end =
      new Date(
        event.end.dateTime
      );

    timeText =
      `${formatTime(start)} – ${formatTime(end)}`;
  }

  element.innerHTML = `

    <div class="event-title">
      ${escapeHtml(
        event.summary ||
        "(No title)"
      )}
    </div>

    <div class="event-time">
      ${timeText}
    </div>

    ${
      event.location
        ? `<div class="event-location">
             📍 ${escapeHtml(
               event.location
             )}
           </div>`
        : ""
    }

  `;

  return element;
}


/* ------------------------------------------------------------
   REFRESH
------------------------------------------------------------ */

async function refreshPlanner() {

  const zip =
    document.getElementById(
      "zipCode"
    ).value.trim();

  if (zip) {
    await loadWeather();
  }

  if (accessToken) {

    await loadCalendarEvents();

  } else {

    renderPlanner();
  }
}

/* ------------------------------------------------------------
   DATE NAVIGATION
------------------------------------------------------------ */

async function changeDay(direction) {

  const datePicker =
    document.getElementById("datePicker");

  if (!datePicker.value) {
    return;
  }

  // Convert the selected date into a local date.
  const currentDate =
    new Date(datePicker.value + "T00:00:00");

  // Move forward or backward one day.
  currentDate.setDate(
    currentDate.getDate() + direction
  );

  // Update the date picker.
  datePicker.value =
    formatDateInput(currentDate);

  // Redraw the planner immediately.
  renderPlanner();

  // Load weather/calendar information for the new date.
  if (accessToken) {
    await loadCalendarEvents();
  }
}



/* ------------------------------------------------------------
   STATUS
------------------------------------------------------------ */

function showStatus(
  message,
  error = false,
  success = false
) {

  const element =
    document.getElementById(
      "statusMessage"
    );

  if (!element) {
    return;
  }

  element.textContent =
    message;

  element.className =
    "status";

  if (error) {
    element.classList.add(
      "error"
    );
  }

  if (success) {
    element.classList.add(
      "success"
    );
  }
}


/* ------------------------------------------------------------
   FORMATTING
------------------------------------------------------------ */

function formatDateInput(date) {

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function formatLocalWeatherDate(
  date
) {

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  const hour =
    String(
      date.getHours()
    ).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:00`;
}


function formatHour(hour) {

  const suffix =
    hour >= 12
      ? "PM"
      : "AM";

  let displayHour =
    hour % 12;

  if (
    displayHour === 0
  ) {

    displayHour = 12;
  }

  return `${displayHour}:00 ${suffix}`;
}


function formatTime(date) {

  return date.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit"
    }
  );
}


function isCurrentHour(date) {

  const now =
    new Date();

  return (

    now.getFullYear() ===
      date.getFullYear() &&

    now.getMonth() ===
      date.getMonth() &&

    now.getDate() ===
      date.getDate() &&

    now.getHours() ===
      date.getHours()
  );
}


/* ------------------------------------------------------------
   SECURITY
------------------------------------------------------------ */

function escapeHtml(value) {

  return String(value)

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );
}
