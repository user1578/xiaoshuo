import { DatabaseSync } from 'node:sqlite'
import type { MobileSqlDatabase, SqlRow, SqlValue } from '../sqlTypes'

type NodeMobileDatabaseOptions = {
  failWhenSqlIncludes?: string
}

export class NodeMobileDatabase implements MobileSqlDatabase {
  readonly calls: string[] = []

  private readonly database = new DatabaseSync(':memory:')
  private failNextSqlIncludes: string | undefined
  private readonly options: NodeMobileDatabaseOptions

  constructor(options: NodeMobileDatabaseOptions = {}) {
    this.options = options
  }

  async execute(statements: string): Promise<void> {
    this.record(statements)
    this.failWhenConfigured(statements)
    this.database.exec(statements)
  }

  async run(statement: string, values: SqlValue[] = []): Promise<{ changes: number; lastInsertRowId?: number }> {
    this.record(statement)
    this.failWhenConfigured(statement)
    const result = this.database.prepare(statement).run(...values)

    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    }
  }

  async query<TRow extends SqlRow>(statement: string, values: SqlValue[] = []): Promise<TRow[]> {
    this.record(statement)
    this.failWhenConfigured(statement)
    return this.database.prepare(statement).all(...values) as TRow[]
  }

  async beginTransaction(): Promise<void> {
    await this.execute('BEGIN TRANSACTION')
  }

  async commitTransaction(): Promise<void> {
    await this.execute('COMMIT')
  }

  async rollbackTransaction(): Promise<void> {
    await this.execute('ROLLBACK')
  }

  async scalar<T>(statement: string): Promise<T | undefined> {
    const rows = await this.query<SqlRow>(statement)
    const row = rows[0]
    return row ? (Object.values(row)[0] as T) : undefined
  }

  async tableNames(): Promise<string[]> {
    const rows = await this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    return rows.map((row) => row.name)
  }

  failNextWhenSqlIncludes(sql: string) {
    this.failNextSqlIncludes = sql
  }

  private record(statement: string) {
    this.calls.push(statement)
  }

  private failWhenConfigured(statement: string) {
    if (this.options.failWhenSqlIncludes && statement.includes(this.options.failWhenSqlIncludes)) {
      throw new Error(`forced failure for ${this.options.failWhenSqlIncludes}`)
    }
    if (this.failNextSqlIncludes && statement.includes(this.failNextSqlIncludes)) {
      const failingSql = this.failNextSqlIncludes
      this.failNextSqlIncludes = undefined
      throw new Error(`forced failure for ${failingSql}`)
    }
  }
}
