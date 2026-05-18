const { Client } = require('pg');
const client = new Client({
  host: 'caboose.proxy.rlwy.net',
  port: 32656,
  user: 'postgres',
  password: 'vneMyYzfApcAcvRhdHNipOfoMuDPhaZb',
  database: 'railway'
});

const sql = `CREATE TABLE pedidos (
  id SERIAL PRIMARY KEY,
  payment_id TEXT,
  external_id TEXT,
  cliente_nome TEXT,
  cliente_email TEXT,
  valor NUMERIC(10,2),
  items JSONB,
  status TEXT DEFAULT 'pendente',
  criado_em TIMESTAMP DEFAULT NOW()
)`;

client.connect().then(() => {
  return client.query(sql);
}).then(() => {
  console.log('Tabela criada com sucesso!');
  client.end();
}).catch(err => {
  console.error('Erro:', err.message);
  client.end();
});