import http from 'node:http'
import { openDatabase } from './db.mjs'
import { createNovel, deleteNovel, getNovelById, importNovelBackup, listNovels, updateNovel } from './novelRepository.mjs'

const HOST = process.env.HOST ?? '127.0.0.1'
const PORT = Number.parseInt(process.env.PORT ?? '3001', 10)

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(data))
}

function sendNoContent(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end()
}

function parseNovelId(pathname) {
  const match = pathname.match(/^\/api\/novels\/(\d+)$/)
  return match ? Number.parseInt(match[1], 10) : null
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const rawBody = Buffer.concat(chunks).toString('utf8')
  if (!rawBody.trim()) return {}

  try {
    return JSON.parse(rawBody)
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 })
  }
}

function handleError(res, error) {
  const statusCode = error.statusCode ?? 500
  sendJson(res, statusCode, {
    error: statusCode === 500 ? 'Internal server error' : error.message,
  })
  if (statusCode === 500) console.error(error)
}

const db = await openDatabase()

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${HOST}:${PORT}`}`)

    if (req.method === 'OPTIONS') {
      sendNoContent(res)
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/novels') {
      sendJson(res, 200, listNovels(db))
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/backup/export') {
      const novels = listNovels(db)
      sendJson(res, 200, {
        exportedAt: new Date().toISOString(),
        count: novels.length,
        novels,
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/backup/import') {
      sendJson(res, 200, importNovelBackup(db, await readJsonBody(req)))
      return
    }

    const novelId = parseNovelId(url.pathname)
    if (novelId !== null) {
      if (req.method === 'GET') {
        const novel = getNovelById(db, novelId)
        sendJson(res, novel ? 200 : 404, novel ?? { error: 'Novel not found' })
        return
      }

      if (req.method === 'PUT') {
        const novel = updateNovel(db, novelId, await readJsonBody(req))
        sendJson(res, novel ? 200 : 404, novel ?? { error: 'Novel not found' })
        return
      }

      if (req.method === 'DELETE') {
        const deleted = deleteNovel(db, novelId)
        if (deleted) sendNoContent(res)
        else sendJson(res, 404, { error: 'Novel not found' })
        return
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/novels') {
      sendJson(res, 201, createNovel(db, await readJsonBody(req)))
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    handleError(res, error)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Novel API server listening at http://${HOST}:${PORT}`)
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
