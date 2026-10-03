import { runCli } from './cli.js'

/** Punto de entrada de `npm run seed:*` / `reset:*`: el código de salida lo decide `runCli`. */
process.exitCode = await runCli(process.argv.slice(2), process.env, {
  out: line => console.log(line),
  err: line => console.error(line),
})
