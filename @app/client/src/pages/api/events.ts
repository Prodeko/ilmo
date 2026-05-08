import { NextApiRequest, NextApiResponse } from "next"
import { Client } from "pg"

const client = new Client({ connectionString: process.env.DATABASE_URL })

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method == "GET") {
    client.connect()
    client.query("SELECT * FROM your_table", (err, queryRes) => {
      if (err) throw err

      const formattedRes = queryRes.rows.map((row) => ({
        ...row,
        name: row.name.fi,
      }))

      res.status(200).json(formattedRes)
      client.end()
    })
  }
}
