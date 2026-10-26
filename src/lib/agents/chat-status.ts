// BaW OS — Chat in-app: textos de estado (módulo puro, lo usa ChatPanel).

/**
 * Texto cuando el agente no respondió tras el umbral. No afirmamos
 * "desconectado" (que haya credencial no dice si el conector está encendido):
 * solo que no respondió y dónde revisar.
 */
export function noResponseMessage(agentName: string): string {
  return `${agentName} no ha respondido; revisa que su conector en OpenClaw esté encendido.`
}
