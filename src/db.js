const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool(
  config.databaseUrl
    ? { connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : false }
    : { host: "localhost", port: 5432, database: "varg", user: "postgres" }
);

const q = (text, params) => pool.query(text, params);

// Produtos iniciais (só entram se a tabela estiver vazia)
const PRODUTOS_INICIAIS = [
  {
    id: "varg-salt", nome: "VARG Salt 30g", categoria: "salt", preco: 30.0, preco_antes: null,
    imagens: ["/img/smelling.png"], tamanhos: [], destaque: true, ordem: 1,
    descricao: "Smelling salt à base de carbonato de amônio. Um estímulo rápido e intenso para o foco antes das séries mais pesadas. Frasco de 30g.",
  },
  ...[
    ["camiseta-preta-branco", "Camiseta VARG preta com logo branco", "/img/1.png"],
    ["camiseta-preta-azul", "Camiseta VARG preta com logo azul", "/img/2.png"],
    ["camiseta-branca-preto", "Camiseta VARG branca com logo preto", "/img/3.png"],
    ["camiseta-preta-dourado", "Camiseta VARG preta com logo dourado", "/img/4.png"],
    ["camiseta-azul-branco", "Camiseta VARG azul marinho com logo branco", "/img/5.png"],
  ].map(([id, nome, img], i) => ({
    id, nome, categoria: "camiseta", preco: 89.9, preco_antes: 109.9,
    imagens: [img], tamanhos: ["P", "M", "G", "GG", "XGG", "3GG", "4GG", "5GG"], destaque: i === 0, ordem: 10 + i,
    descricao: "Camiseta VARG Wear em algodão, modelagem para treino e para o dia a dia. Vista o lobo.",
  })),
];

// Se uma tabela existir num formato antigo (sem as colunas essenciais), ela é guardada como <nome>_legado
// e a tabela nova é criada do zero. Nada é apagado.
async function guardarLegado(q, tabela, colunas) {
  const existe = await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`, [tabela]);
  if (!existe.rowCount) return;
  const { rows } = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [tabela]);
  const tem = new Set(rows.map((r) => r.column_name));
  if (colunas.every((c) => tem.has(c))) return;
  let nome = tabela + "_legado";
  for (let i = 2; (await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`, [nome])).rowCount; i++) nome = `${tabela}_legado_${i}`;
  await q(`ALTER TABLE ${tabela} RENAME TO ${nome}`);
  console.log(`[db] Tabela ${tabela} antiga guardada como ${nome}`);
}

async function migrar() {
  const client = await pool.connect();
  const q = (text, params) => client.query(text, params);
  try {
    await q("BEGIN");
    await guardarLegado(q, "pedidos", ["codigo", "usuario_id", "itens", "endereco", "metodo"]);
    await guardarLegado(q, "pedido_eventos", ["pedido_id", "status", "autor"]);
    await guardarLegado(q, "usuarios", ["id", "nome", "email", "senha"]);
    await guardarLegado(q, "produtos", ["id", "nome", "preco", "imagens", "tamanhos", "ativo"]);
    await guardarLegado(q, "estoque", ["produto_id", "variacao", "quantidade"]);
    await guardarLegado(q, "cupons", ["id", "codigo"]);
    await guardarLegado(q, "lista_espera", ["id", "produto_id", "email"]);

    await q(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        reset_token TEXT,
        reset_expires TIMESTAMPTZ,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cpf TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS endereco JSONB;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT NOW();

      CREATE TABLE IF NOT EXISTS produtos (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        descricao TEXT DEFAULT '',
        categoria TEXT NOT NULL DEFAULT 'camiseta',
        preco NUMERIC(10,2) NOT NULL,
        preco_antes NUMERIC(10,2),
        imagens JSONB NOT NULL DEFAULT '[]',
        tamanhos JSONB NOT NULL DEFAULT '[]',
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        destaque BOOLEAN NOT NULL DEFAULT FALSE,
        ordem INT NOT NULL DEFAULT 0,
        criado_em TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS estoque (
        produto_id TEXT NOT NULL,
        variacao TEXT NOT NULL DEFAULT 'unico',
        quantidade INT NOT NULL DEFAULT 0,
        alerta_minimo INT NOT NULL DEFAULT 5,
        atualizado_em TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (produto_id, variacao)
      );
      ALTER TABLE estoque ADD COLUMN IF NOT EXISTS alerta_minimo INT NOT NULL DEFAULT 5;
      ALTER TABLE estoque ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT NOW();

      CREATE TABLE IF NOT EXISTS cupons (
        id SERIAL PRIMARY KEY,
        codigo TEXT UNIQUE NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE cupons ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE cupons ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE cupons ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'percentual';
      ALTER TABLE cupons ADD COLUMN IF NOT EXISTS valor NUMERIC(10,2) NOT NULL DEFAULT 10;
      ALTER TABLE cupons ADD COLUMN IF NOT EXISTS minimo NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE cupons ADD COLUMN IF NOT EXISTS limite_usos INT;
      ALTER TABLE cupons ADD COLUMN IF NOT EXISTS usos INT NOT NULL DEFAULT 0;
      ALTER TABLE cupons ADD COLUMN IF NOT EXISTS validade TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        codigo TEXT UNIQUE NOT NULL,
        usuario_id INT REFERENCES usuarios(id),
        cliente_nome TEXT NOT NULL,
        cliente_email TEXT NOT NULL,
        cliente_telefone TEXT,
        cliente_cpf TEXT,
        endereco JSONB NOT NULL,
        itens JSONB NOT NULL,
        subtotal NUMERIC(10,2) NOT NULL,
        desconto NUMERIC(10,2) NOT NULL DEFAULT 0,
        frete NUMERIC(10,2) NOT NULL DEFAULT 0,
        total NUMERIC(10,2) NOT NULL,
        cupom TEXT,
        metodo TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'aguardando_pagamento',
        pagamento_id TEXT,
        pix_copia_cola TEXT,
        pix_qr TEXT,
        pix_expira_em TIMESTAMPTZ,
        cripto_tx TEXT,
        transportadora TEXT,
        codigo_rastreio TEXT,
        observacao_admin TEXT,
        estoque_baixado BOOLEAN NOT NULL DEFAULT FALSE,
        pago_em TIMESTAMPTZ,
        enviado_em TIMESTAMPTZ,
        entregue_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS pedidos_usuario_idx ON pedidos(usuario_id);
      CREATE INDEX IF NOT EXISTS pedidos_status_idx ON pedidos(status);
      CREATE INDEX IF NOT EXISTS pedidos_pagamento_idx ON pedidos(pagamento_id);

      CREATE TABLE IF NOT EXISTS pedido_eventos (
        id SERIAL PRIMARY KEY,
        pedido_id INT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        nota TEXT,
        autor TEXT NOT NULL DEFAULT 'sistema',
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS lista_espera (
        id SERIAL PRIMARY KEY,
        produto_id TEXT NOT NULL,
        variacao TEXT NOT NULL DEFAULT 'unico',
        email TEXT NOT NULL,
        nome TEXT DEFAULT '',
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS variacao TEXT NOT NULL DEFAULT 'unico';
      ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS nome TEXT DEFAULT '';
      ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS avisado_em TIMESTAMPTZ;
    `);

    // O "salvar estoque" precisa de chave única por produto+variação (tabelas antigas podem não ter)
    await q("SAVEPOINT idx");
    try {
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS estoque_produto_variacao_idx ON estoque(produto_id, variacao)`);
    } catch (e) {
      await q("ROLLBACK TO SAVEPOINT idx");
      await q(`DELETE FROM estoque a USING estoque b WHERE a.ctid < b.ctid AND a.produto_id = b.produto_id AND a.variacao = b.variacao`);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS estoque_produto_variacao_idx ON estoque(produto_id, variacao)`);
    }

    const { rows } = await q(`SELECT COUNT(*)::int AS n FROM produtos`);
    if (rows[0].n === 0) {
      for (const p of PRODUTOS_INICIAIS) {
        await q(
          `INSERT INTO produtos (id, nome, descricao, categoria, preco, preco_antes, imagens, tamanhos, destaque, ordem)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [p.id, p.nome, p.descricao, p.categoria, p.preco, p.preco_antes, JSON.stringify(p.imagens), JSON.stringify(p.tamanhos), p.destaque, p.ordem]
        );
      }
      console.log("[db] Produtos iniciais cadastrados");
    }
    await q("COMMIT");
  } catch (e) {
    await q("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, q, migrar };
