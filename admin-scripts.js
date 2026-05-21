const adminToken = new URLSearchParams(window.location.search).get('token') || localStorage.getItem('adminToken') || '';

async function marcarEnviado(id) {
  const input = document.getElementById('rastreio_' + id);
  const codigo = input ? input.value.trim() : '';
  if (!codigo) { alert('Digite o código de rastreio!'); return; }
  const res = await fetch('/api/pedidos/' + id + '/envio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
    body: JSON.stringify({ codigo_rastreio: codigo, status_envio: 'enviado' })
  });
  const data = await res.json();
  if (data.success) { location.reload(); }
  else { alert('Erro ao atualizar!'); }
}

function exportarExcel() {
  const table = document.getElementById('tabelaPedidos');
  if (!table) { alert('Tabela não encontrada'); return; }
  let csv = [];
  const rows = table.querySelectorAll('tr');
  rows.forEach(function(row) {
    const cols = row.querySelectorAll('th, td');
    const rowData = [];
    cols.forEach(function(col) {
      let txt = (col.innerText || '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
      rowData.push('"' + txt + '"');
    });
    csv.push(rowData.join(','));
  });
  const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pedidos_varg.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
