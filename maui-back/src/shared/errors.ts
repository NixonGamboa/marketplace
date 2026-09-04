export class DomainError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'DomainError'
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public readonly issues?: unknown) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT')
    this.name = 'ConflictError'
  }
}
