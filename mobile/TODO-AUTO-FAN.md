# Auto-Ventilateur on Threshold Exceed

Status: Plan approved

### Steps:

#### 1. Edit usePoultryState.js (Core Logic)

- Add `autoFanRef = useRef({ lastTrigger: 0 })`
- In /measures handler: if fanAuto && any sensor.status === 'danger' && !fanOn && Date.now() - lastTrigger > 30000
  → publishCommand('fan', true); autoFanRef.current.lastTrigger = Date.now()
- Capteurs: temperature, humidity, co2

#### 2. Test

- Set fanAuto=true
- Simulate measures > threshold → Fan auto-on

Next: Edit usePoultryState.js
