export enum EndpointBehaviour {
  DEFAULT = 'DEFAULT',
  ERROR = 'ERROR',
  STALL = 'STALL',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

export class EndpointBehaviourManager {
  private overrides = new Map<string, EndpointBehaviour>()

  get(procedurePath: string): EndpointBehaviour {
    return this.overrides.get(procedurePath) ?? EndpointBehaviour.DEFAULT
  }

  set(procedurePath: string, behaviour: EndpointBehaviour): void {
    if (behaviour === EndpointBehaviour.DEFAULT) {
      this.overrides.delete(procedurePath)
    } else {
      this.overrides.set(procedurePath, behaviour)
    }
  }

  reset(procedurePath: string): void {
    this.overrides.delete(procedurePath)
  }

  resetAll(): void {
    this.overrides.clear()
  }
}
