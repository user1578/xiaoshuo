import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import { enableMobileForeignKeys, migrateMobileDatabase } from './mobileMigrations'
import type { MobileSqlDatabase, SqlRow, SqlValue } from './sqlTypes'

const DATABASE_NAME = 'novelbag.db'

class CapacitorMobileDatabase implements MobileSqlDatabase {
  private readonly connection: SQLiteDBConnection

  constructor(connection: SQLiteDBConnection) {
    this.connection = connection
  }

  async execute(statements: string): Promise<void> {
    await this.connection.execute(statements, false)
  }

  async run(statement: string, values: SqlValue[] = []): Promise<{ changes: number; lastInsertRowId?: number }> {
    const result = await this.connection.run(statement, values, false)
    const changes = result.changes

    return {
      changes: changes?.changes ?? 0,
      ...(changes?.lastId === undefined ? {} : { lastInsertRowId: changes.lastId }),
    }
  }

  async query<TRow extends SqlRow>(statement: string, values: SqlValue[] = []): Promise<TRow[]> {
    const result = await this.connection.query(statement, values)
    return (result.values ?? []) as TRow[]
  }

  async beginTransaction(): Promise<void> {
    await this.connection.beginTransaction()
  }

  async commitTransaction(): Promise<void> {
    await this.connection.commitTransaction()
  }

  async rollbackTransaction(): Promise<void> {
    await this.connection.rollbackTransaction()
  }
}

let initializationPromise: Promise<MobileSqlDatabase> | undefined

async function initializeMobileDatabase(): Promise<MobileSqlDatabase> {
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  const hasExistingConnection = await sqlite.isConnection(DATABASE_NAME, false)
  const connection = hasExistingConnection.result
    ? await sqlite.retrieveConnection(DATABASE_NAME, false)
    : await sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false)
  const isOpen = await connection.isDBOpen()

  if (!isOpen.result) {
    await connection.open()
  }

  const database = new CapacitorMobileDatabase(connection)
  await enableMobileForeignKeys(database)
  await migrateMobileDatabase(database)
  return database
}

export function openMobileDatabase(): Promise<MobileSqlDatabase> {
  initializationPromise ??= initializeMobileDatabase().catch((error: unknown) => {
    initializationPromise = undefined
    throw error
  })

  return initializationPromise
}
