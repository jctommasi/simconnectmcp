export enum SimVarCategory {
  Position = 'Position',
  Engine = 'Engine',
  ControlSurface = 'ControlSurface',
  Autopilot = 'Autopilot',
  Instrument = 'Instrument',
  Radio = 'Radio',
  GPS = 'GPS',
  Lighting = 'Lighting',
  Systems = 'Systems',
  WeightBalance = 'WeightBalance',
  Weather = 'Weather',
  Simulation = 'Simulation',
  LandingGear = 'LandingGear',
}

export interface SimVarDefinition {
  name: string;
  units: string;
  writable: boolean;
  type: 'number' | 'string' | 'boolean';
  description: string;
  category: string;
}
