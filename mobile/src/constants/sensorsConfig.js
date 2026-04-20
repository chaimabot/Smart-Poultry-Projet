export const SENSOR_CONFIG = [
  {
    name: "Température",
    unit: "°C",
    icon: "thermostat",
    key: "temperature",
  },
  {
    name: "Humidité",
    unit: "%",
    icon: "water-drop",
    key: "humidity",
  },
  {
    name: "CO2",
    unit: "ppm",
    icon: "co2",
    key: "co2",
  },
  {
    name: "NH3",
    unit: "ppm",
    icon: "warning",
    key: "nh3",
  },
  {
    name: "Poussière",
    unit: "µg/m³",
    icon: "grain",
    key: "dust",
  },
  {
    name: "Niveau eau",
    unit: "%",
    icon: "water",
    key: "waterLevel", // ✅ FIX
  },
];
