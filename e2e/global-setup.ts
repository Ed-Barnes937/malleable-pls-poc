import { reseed } from './reseed'

export default async function globalSetup() {
  await reseed()
}
