import { test as base, expect } from '@playwright/experimental-ct-react'
import { BackendSimulator } from './backend-simulator'

type SimulatorFixtures = {
  simulator: BackendSimulator
}

export const test = base.extend<SimulatorFixtures>({
  simulator: async ({ page }, use) => {
    const simulator = new BackendSimulator()
    await simulator.handleNetworking(page)
    await use(simulator)
  },
})

export { expect }
export { EndpointBehaviour } from './backend-simulator'
