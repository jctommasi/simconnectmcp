export interface EventDefinition {
  name: string;
  description: string;
  hasParam: boolean;
  paramDescription?: string;
  category: string;
}

export enum EventCategory {
  Simulation = 'Simulation',
  Autopilot = 'Autopilot',
  Engine = 'Engine',
  Controls = 'Controls',
  Lights = 'Lights',
  Radio = 'Radio',
}
