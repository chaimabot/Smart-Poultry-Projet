import realtimeService from "../../services/realtimeService";
import { SENSOR_CONFIG } from "../../hooks/sensorConfig";

const [sensorsLive, setSensorsLive] = useState(
  SENSOR_CONFIG.map((s) => ({
    ...s,
    value: "--",
  })),
);

useEffect(() => {
  realtimeService.joinPoulailler(id);

  const handleMeasures = (data) => {
    console.log("[MEASURES LIVE]", data);

    const newSensors = SENSOR_CONFIG.map((sensorConfig) => {
      const rawValue = data[sensorConfig.key];
      const value =
        rawValue !== undefined && rawValue !== null
          ? Number(rawValue).toFixed(1)
          : "--";

      return {
        key: sensorConfig.key,
        name: sensorConfig.name,
        value,
        unit: sensorConfig.unit,
        icon: sensorConfig.icon,
      };
    });

    setSensorsLive(newSensors);
    console.log("[SENSORS ARRAY]", newSensors);
  };

  realtimeService.onMeasures(handleMeasures);

  return () => {
    realtimeService.leavePoulailler(id);
    realtimeService.offMeasures(handleMeasures);
  };
}, [id]);

// Passer à OverviewTab
<OverviewTab
  sensors={sensorsLive}
  thresholds={poultry?.thresholds || {}}
  refreshing={refreshing}
  onRefresh={onRefresh}
/>;
