export class ProgramEditError extends Error {
  constructor(message: string) { super(message); this.name = 'ProgramEditError' }
}
