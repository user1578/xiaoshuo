export type SqlValue = string | number | null
export type SqlRow = Record<string, unknown>

export interface MobileSqlDatabase {
  execute(statements: string): Promise<void>
  run(statement: string, values?: SqlValue[]): Promise<{ changes: number; lastInsertRowId?: number }>
  query<TRow extends SqlRow>(statement: string, values?: SqlValue[]): Promise<TRow[]>
  beginTransaction(): Promise<void>
  commitTransaction(): Promise<void>
  rollbackTransaction(): Promise<void>
}
