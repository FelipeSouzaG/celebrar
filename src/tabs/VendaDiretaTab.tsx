import { FormEvent, useEffect, useState } from "react";
import { adminApi } from "../api";
import { Icons } from "../components/Icons";
import { CurrencyInput, Modal } from "../components/Shared";
import logoLoja from "../img/logo.jpg";
import {
  Cliente,
  ContaBancaria,
  NfeResult,
  Produto,
  VendaDiretaMutationResponse,
} from "../types";
import { formatDate, formatDateOnly, toInputDate } from "../utils";

export function VendaDiretaTab() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [clienteQuery, setClienteQuery] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<{
    id: string;
    nome: string;
  } | null>(null);
  const [clienteSuggestions, setClienteSuggestions] = useState<Cliente[]>([]);
  const [produtoQuery, setProdutoQuery] = useState("");
  const [produtoSuggestions, setProdutoSuggestions] = useState<Produto[]>([]);
  const [tempItem, setTempItem] = useState<any>({
    produtoId: "",
    produtoNome: "",
    qtd: 1,
    preco_un_aplicado: 0,
    precoManual: false,
    estoque: 0,
    produtoDetalhes: null,
  });
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [vendas, setVendas] = useState<any[]>([]);
  const [alertModal, setAlertModal] = useState<{
    open: boolean;
    title: string;
    message: string;
  }>({ open: false, title: "", message: "" });
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedVenda, setSelectedVenda] = useState<any | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterDataCriacao, setFilterDataCriacao] = useState("");
  const [filterDataEntrega, setFilterDataEntrega] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [form, setForm] = useState<any>({
    clienteId: "",
    endereco: {},
    itens: [] as any[],
    data_entrega: "",
    frete: 0,
    formaPagamento: "DINHEIRO",
    status: "PEDIDO",
  });

  useEffect(() => {
    (async () => {
      try {
        const [c, p, contas] = await Promise.all([
          adminApi.getClientes(),
          adminApi.getProdutos(),
          adminApi.getContas({ tipo_uso: "RECEBIMENTO" }),
        ]);
        setClientes(c);
        setProdutos(p);
        setContas(contas);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const loadVendas = async () => {
    try {
      const res = await adminApi.getVendasDiretas();
      setVendas(res || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadVendas();
  }, []);

  // Busca clientes para autocomplete (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!clienteQuery) return setClienteSuggestions([]);
      if (selectedCliente && clienteQuery === selectedCliente.nome) {
        setClienteSuggestions([]);
        return;
      }
      try {
        const res = await adminApi.getClientes(clienteQuery);
        setClienteSuggestions(res || []);
      } catch (e) {
        setClienteSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [clienteQuery]);

  // Busca produtos para autocomplete (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!produtoQuery) return setProdutoSuggestions([]);
      if (tempItem.produtoId && produtoQuery === tempItem.produtoNome) {
        setProdutoSuggestions([]);
        return;
      }
      try {
        const res = await adminApi.searchProdutos(produtoQuery);
        setProdutoSuggestions(res || []);
      } catch (e) {
        setProdutoSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [produtoQuery]);

  const addItem = () => {
    if (!tempItem.produtoId) {
      return setAlertModal({
        open: true,
        title: "Item",
        message: "Selecione um produto para adicionar.",
      });
    }
    const { precoManual, ...item } = tempItem;
    setForm((s: any) => ({
      ...s,
      itens: [...s.itens, { ...item }],
    }));
    setTempItem({
      produtoId: "",
      produtoNome: "",
      qtd: 1,
      preco_un_aplicado: 0,
      precoManual: false,
      estoque: 0,
      produtoDetalhes: null,
    });
    setProdutoQuery("");
    setProdutoSuggestions([]);
  };

  const removeItem = (idx: number) => {
    setForm((s: any) => ({
      ...s,
      itens: s.itens.filter((_: any, i: number) => i !== idx),
    }));
  };

  const updateItem = (idx: number, patch: any) => {
    setForm((s: any) => {
      const items = [...s.itens];
      items[idx] = { ...items[idx], ...patch };
      // Ajusta preco por atacado se qtd_atacado for atingido
      const it = items[idx];
      if (it.produtoDetalhes && !("preco_un_aplicado" in patch)) {
        const pd = it.produtoDetalhes;
        const qtdAtacado = pd.produto.qtd_atacado || 0;
        if (qtdAtacado > 0 && it.qtd >= qtdAtacado) {
          items[idx].preco_un_aplicado = pd.produto.preco_atacado;
        } else {
          items[idx].preco_un_aplicado = pd.produto.preco_varejo;
        }
      }
      return { ...s, itens: items };
    });
  };

  const subtotal = form.itens.reduce(
    (acc: number, it: any) => acc + (it.preco_un_aplicado || 0) * (it.qtd || 0),
    0,
  );
  const total = subtotal + (form.frete || 0);

  const resolvePagamentoLabel = (tipo?: string) => {
    const t = String(tipo || "").toUpperCase();
    if (t === "DINHEIRO") return "Dinheiro";
    if (t === "PIX") return "PIX";
    if (t === "CARTAO") return "Cartão";
    return t || "-";
  };

  const escapeHtml = (value: any) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const printNfeA4 = (nfe: NfeResult, venda: any) => {
    if (!nfe?.authorized) return;

    const itens = Array.isArray(venda?.itens) ? venda.itens : [];
    const toNumber = (value: any) => {
      const normalized =
        typeof value === "string" ? value.replace(",", ".") : value;
      const n = Number(normalized);
      return Number.isFinite(n) ? n : 0;
    };
    const formatMoney = (value: number) =>
      value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const formatDateTime = (value?: string) => {
      if (!value) return "-";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      return d.toLocaleString("pt-BR");
    };

    const emit = nfe.emitente || {};
    const emitEndereco = emit.endereco || {};
    const empresaNome = emit.nome || "Celebrar Festas e Embalagens";
    const empresaEndereco = [
      emitEndereco.logradouro || "-",
      emitEndereco.numero || "S/N",
      emitEndereco.complemento || "",
      emitEndereco.bairro ? `- ${emitEndereco.bairro}` : "",
      emitEndereco.cidade ? `- ${emitEndereco.cidade}/${emitEndereco.uf || ""}` : "",
      emitEndereco.cep ? `- CEP ${emitEndereco.cep}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const empresaTelefone = emit.fone || "-";

    const cliente = venda?.cliente || {};
    const dest = nfe.destinatario || {};
    const destEndereco = dest.endereco || {};
    const documentoDest =
      dest.documento || String(cliente?.documento || "").replace(/\D/g, "");
    const documentoDestTipo =
      dest.documentoTipo ||
      (documentoDest.length === 14
        ? "CNPJ"
        : documentoDest.length === 11
          ? "CPF"
          : "CPF/CNPJ");

    const enderecoDestLogradouro =
      venda?.endereco_rua || destEndereco.logradouro || cliente?.rua || "-";
    const enderecoDestNumero =
      venda?.endereco_numero || destEndereco.numero || cliente?.numero || "S/N";
    const enderecoDestComplemento =
      venda?.endereco_complemento ||
      destEndereco.complemento ||
      cliente?.complemento ||
      "";
    const enderecoDestBairro =
      venda?.endereco_bairro || destEndereco.bairro || cliente?.bairro || "-";
    const enderecoDestCidade =
      venda?.endereco_cidade || destEndereco.cidade || cliente?.cidade || "-";
    const enderecoDestUf =
      venda?.endereco_estado || destEndereco.uf || cliente?.estado || "-";
    const enderecoDestCep =
      venda?.endereco_cep || destEndereco.cep || cliente?.cep || "-";
    const enderecoDestLinha = `${enderecoDestLogradouro}, ${enderecoDestNumero}${
      enderecoDestComplemento ? ` - ${enderecoDestComplemento}` : ""
    }`;

    const valorProdutos = itens.reduce(
      (acc: number, it: any) =>
        acc + toNumber(it?.qtd || 0) * toNumber(it?.preco_un_aplicado || 0),
      0,
    );
    const valorFrete = toNumber(
      venda?.frete ?? nfe?.totais?.vFrete ?? 0,
    );
    const valorOutros = toNumber(
      venda?.outros ?? venda?.outrasDespesas ?? nfe?.totais?.vOutro ?? 0,
    );
    const baseIcms = valorProdutos;
    const valorIcms = toNumber(nfe?.totais?.vICMS ?? 0);
    const valorTotalNota = valorProdutos + valorFrete + valorOutros;

    const itensRows = itens
      .map((it: any, idx: number) => {
        const codigo =
          it?.produto?.codigo_barras || it?.produtoId || String(idx + 1);
        const descricao = it?.produto?.nome || it?.produtoNome || "Item";
        const unidade = it?.produto?.embalagemUnidade || "UN";
        const qtd = toNumber(it?.qtd || 0);
        const unit = toNumber(it?.preco_un_aplicado || 0);
        const subtotalItem = qtd * unit;
        const baseIcmsItem = subtotalItem;
        const valorIcmsItem = 0;
        const aliquota = "0,00%";
        return `<tr>
          <td>${escapeHtml(codigo)}</td>
          <td>${escapeHtml(descricao)}</td>
          <td class="center">${escapeHtml(unidade)}</td>
          <td class="right">${qtd.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
          <td class="right">${formatMoney(unit)}</td>
          <td class="right">${formatMoney(baseIcmsItem)}</td>
          <td class="right">${formatMoney(valorIcmsItem)}</td>
          <td class="right">${aliquota}</td>
        </tr>`;
      })
      .join("");

    const dataNota = formatDateTime(nfe?.dataAutorizacao || venda?.data_venda);
    const protocoloAutorizacao = nfe?.protocolo || "-";
    const serieNota = nfe?.serie ?? "-";
    const numeroNota = nfe?.numero ?? "-";
    const naturezaOperacao = nfe?.naturezaOperacao || "VENDA DIRETA";

    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>DANFE NF-e</title>
    <style>
      @page { size: A4 portrait; margin: 1cm; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 11px; }
      .sheet { width: 100%; }
      .box { border: 1px solid #000; margin-bottom: 6px; }
      .header-grid { display: grid; grid-template-columns: 38% 26% 36%; gap: 6px; }
      .company { display: flex; gap: 8px; padding: 6px; min-height: 116px; }
      .logo { width: 84px; height: 84px; object-fit: contain; border: 1px solid #999; padding: 2px; }
      .company h2 { margin: 0 0 4px; font-size: 12px; line-height: 1.3; }
      .company .line { margin: 2px 0; line-height: 1.3; }
      .nf-box, .access-box { padding: 6px; min-height: 116px; }
      .nf-title { font-size: 16px; font-weight: 700; text-align: center; margin: 0 0 6px; }
      .center { text-align: center; }
      .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; background: #efefef; padding: 4px 6px; border-bottom: 1px solid #000; }
      .info-line { padding: 4px 6px; display: grid; gap: 6px; }
      .line-4 { grid-template-columns: 2fr 1fr 1fr 1fr; }
      .line-7 { grid-template-columns: 2fr 1fr 2fr 1fr 1.5fr 0.6fr 1fr; }
      .line-6 { grid-template-columns: 1.3fr 1fr 1.5fr 1fr 1fr 1.3fr; }
      .field b { display: block; font-size: 10px; margin-bottom: 2px; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th, td { border: 1px solid #000; padding: 4px; vertical-align: top; }
      th { background: #efefef; text-align: left; font-weight: 700; text-transform: uppercase; font-size: 9px; }
      .right { text-align: right; }
      .canhoto { margin-top: 8px; border: 1px dashed #000; padding: 8px; font-size: 10px; }
      .canhoto .title { font-weight: 700; margin-bottom: 6px; }
      .signature { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
      .signature div { border-top: 1px solid #000; padding-top: 4px; text-align: center; min-height: 20px; }
      .muted { color: #333; font-size: 10px; line-height: 1.35; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header-grid">
        <div class="box company">
          <img src="${logoLoja}" alt="Logo da loja" class="logo" />
          <div>
            <h2>${escapeHtml(empresaNome)}</h2>
            <div class="line"><b>Endereço:</b> ${escapeHtml(empresaEndereco)}</div>
            <div class="line"><b>Telefone:</b> ${escapeHtml(empresaTelefone)}</div>
          </div>
        </div>
        <div class="box nf-box">
          <div class="nf-title">DANFE</div>
          <div class="center">Documento Auxiliar da Nota Fiscal Eletrônica</div>
          <div class="center"><b>Nota de Saída</b></div>
          <div class="center" style="margin-top:8px"><b>Número:</b> ${escapeHtml(numeroNota)}</div>
          <div class="center"><b>Série:</b> ${escapeHtml(serieNota)}</div>
        </div>
        <div class="box access-box">
          <div><b>Chave de Acesso</b></div>
          <div style="word-break: break-all; margin: 4px 0 6px;">${escapeHtml(nfe.chaveAcesso || "-")}</div>
          <div class="muted">Consulta de autenticidade no portal nacional da NF-e em www.nfe.fazenda.gov.br/portal ou no site da Sefaz autorizada.</div>
          <div style="margin-top: 8px;"><b>Protocolo de autorização de uso</b></div>
          <div>${escapeHtml(`${protocoloAutorizacao} - ${dataNota}`)}</div>
        </div>
      </div>

      <div class="box">
        <div class="section-title">Complemento do Cabeçalho</div>
        <div class="info-line line-4">
          <div class="field"><b>Natureza da Operação</b>${escapeHtml(naturezaOperacao)}</div>
          <div class="field"><b>Inscrição Estadual</b>${escapeHtml(emit.ie || "-")}</div>
          <div class="field"><b>CNPJ</b>${escapeHtml(emit.cnpj || "-")}</div>
          <div class="field"><b>Data da Nota Fiscal</b>${escapeHtml(dataNota)}</div>
        </div>
      </div>

      <div class="box">
        <div class="section-title">Destinatário</div>
        <div class="info-line line-7">
          <div class="field"><b>Nome</b>${escapeHtml(dest.nome || cliente?.nome || "-")}</div>
          <div class="field"><b>${escapeHtml(documentoDestTipo)}</b>${escapeHtml(documentoDest || "-")}</div>
          <div class="field"><b>Endereço</b>${escapeHtml(enderecoDestLinha)}</div>
          <div class="field"><b>Bairro</b>${escapeHtml(enderecoDestBairro)}</div>
          <div class="field"><b>Cidade</b>${escapeHtml(enderecoDestCidade)}</div>
          <div class="field"><b>UF</b>${escapeHtml(enderecoDestUf)}</div>
          <div class="field"><b>CEP</b>${escapeHtml(enderecoDestCep)}</div>
        </div>
        <div class="info-line" style="grid-template-columns: 1fr;">
          <div class="field"><b>Inscrição Estadual</b>${escapeHtml(dest.ie || "-")}</div>
        </div>
      </div>

      <div class="box">
        <div class="section-title">Valores da Nota</div>
        <div class="info-line line-6">
          <div class="field"><b>Base de Cálculo do ICMS</b>${formatMoney(baseIcms)}</div>
          <div class="field"><b>Valor do ICMS</b>${formatMoney(valorIcms)}</div>
          <div class="field"><b>Valor Total dos Produtos</b>${formatMoney(valorProdutos)}</div>
          <div class="field"><b>Frete</b>${formatMoney(valorFrete)}</div>
          <div class="field"><b>Outros Valores</b>${formatMoney(valorOutros)}</div>
          <div class="field"><b>Valor Total da Nota</b>${formatMoney(valorTotalNota)}</div>
        </div>
      </div>

      <div class="box">
        <div class="section-title">Dados dos Produtos</div>
        <table>
          <thead>
            <tr>
              <th style="width: 12%;">Código</th>
              <th style="width: 34%;">Descrição do Produto</th>
              <th style="width: 8%;">Unidade</th>
              <th style="width: 10%;" class="right">Quantidade</th>
              <th style="width: 12%;" class="right">Valor Unitário</th>
              <th style="width: 12%;" class="right">Base p/ ICMS</th>
              <th style="width: 7%;" class="right">Valor ICMS</th>
              <th style="width: 5%;" class="right">Alíquota</th>
            </tr>
          </thead>
          <tbody>
            ${
              itensRows ||
              `<tr><td colspan="8" class="center">Sem itens na venda.</td></tr>`
            }
          </tbody>
        </table>
      </div>

      <div class="canhoto">
        <div class="title">Canhoto de Recebimento</div>
        <div>
          Recebemos de Celebrar Festas e Embalagens o(s) produto(s) constante(s) na Nota Fiscal nº
          <b> ${escapeHtml(numeroNota)} </b> Série <b>${escapeHtml(serieNota)}</b>.
        </div>
        <div class="signature">
          <div>Data de recebimento</div>
          <div>Nome legível</div>
          <div>CPF ou Identidade do recebedor</div>
        </div>
      </div>
    </div>
  </body>
</html>`;

    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);

    const win = frame.contentWindow;
    if (!win) {
      document.body.removeChild(frame);
      throw new Error("Não foi possível abrir a janela de impressão.");
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    setTimeout(() => {
      win.focus();
      win.print();
      setTimeout(() => {
        if (document.body.contains(frame)) document.body.removeChild(frame);
      }, 500);
    }, 200);
  };

  const showFiscalFeedback = (
    result: VendaDiretaMutationResponse | undefined,
    successMessage: string,
    venda?: any,
  ) => {
    if (result?.nfe?.statusCode === "DISABLED") {
      setAlertModal({
        open: true,
        title: "Venda Direta",
        message: `${successMessage}\nEmissão de NF-e em teste está desativada no backend.`,
      });
      return;
    }

    if (result?.nfe?.authorized) {
      try {
        printNfeA4(result.nfe, venda);
      } catch (e) {
        console.error(e);
      }
      setAlertModal({
        open: true,
        title: "Venda Direta",
        message: `${successMessage}\nNF-e autorizada em homologação. Impressão A4 enviada.`,
      });
      return;
    }

    if (result?.nfe?.attempted) {
      setAlertModal({
        open: true,
        title: "Venda salva com alerta fiscal",
        message: `Venda salva, mas a NF-e não foi autorizada. [${result.nfe?.statusCode || "SEM_COD"}] ${result.nfe?.statusMessage || "Sem detalhe."}`,
      });
      return;
    }

    if (result?.nfe && !result.nfe.attempted) {
      setAlertModal({
        open: true,
        title: "Venda salva com alerta fiscal",
        message: `Venda salva, mas a NF-e não foi emitida. ${result.nfe?.statusMessage || "Sem detalhe."}`,
      });
      return;
    }

    setAlertModal({
      open: true,
      title: "Venda Direta",
      message: successMessage,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.itens || form.itens.length === 0)
      return setAlertModal({
        open: true,
        title: "Venda Direta",
        message: "Adicione pelo menos um item.",
      });

    try {
      const isDinheiro = form.formaPagamento === "DINHEIRO";
      const contaBancariaId = !isDinheiro ? form.formaPagamento : null;
      const tipo_pagamento = isDinheiro ? "DINHEIRO" : "CARTAO";

      if (editingId) {
        // Editar venda existente
        const vendaParaImpressao = {
          codigo: editingId,
          data_venda: new Date().toISOString(),
          cliente: selectedCliente ? { nome: selectedCliente.nome } : undefined,
          tipo_pagamento,
          total,
          itens: form.itens,
        };
        const result = await adminApi.updateVendaDireta(editingId, {
          clienteId: form.clienteId || null,
          endereco: form.endereco,
          itens: form.itens,
          total,
          tipo_pagamento,
          contaBancariaId,
          data_entrega: form.data_entrega || null,
          frete: form.frete || 0,
          status: form.status,
        });
        const vendaRetornada = result?.venda
          ? { ...vendaParaImpressao, ...result.venda }
          : vendaParaImpressao;
        showFiscalFeedback(result, "Venda atualizada com sucesso.", vendaRetornada);
        setEditingId(null);
      } else {
        // Criar nova venda
        const vendaParaImpressao = {
          data_venda: new Date().toISOString(),
          cliente: selectedCliente ? { nome: selectedCliente.nome } : undefined,
          tipo_pagamento,
          total,
          itens: form.itens,
        };
        const result = await adminApi.createVendaDireta({
          clienteId: form.clienteId || null,
          endereco: form.endereco,
          itens: form.itens,
          total,
          tipo_pagamento,
          contaBancariaId,
          data_entrega: form.data_entrega || null,
          frete: form.frete || 0,
          status: form.status,
        });
        const vendaRetornada = result?.venda ? { ...vendaParaImpressao, ...result.venda } : vendaParaImpressao;
        showFiscalFeedback(result, "Venda criada com sucesso.", vendaRetornada);
      }
      setModalOpen(false);
      // Recarrega lista
      loadVendas();
      // reset form
      setForm({
        clienteId: "",
        endereco: {},
        itens: [],
        data_entrega: "",
        frete: 0,
        formaPagamento: "DINHEIRO",
        status: "PEDIDO",
      });
      setClienteQuery("");
      setClienteSuggestions([]);
      setSelectedCliente(null);
      setProdutoQuery("");
      setProdutoSuggestions([]);
      setTempItem({
        produtoId: "",
        produtoNome: "",
        qtd: 1,
        preco_un_aplicado: 0,
        precoManual: false,
        estoque: 0,
        produtoDetalhes: null,
      });
    } catch (err: any) {
      setAlertModal({
        open: true,
        title: "Erro ao salvar",
        message: err.message || "Erro ao salvar venda.",
      });
    }
  };

  const getMinDate = () => toInputDate(new Date());

  const getMargemInfo = (it: any) => {
    const pd = it.produtoDetalhes?.produto;
    const custo = Number(pd?.custo_produto || 0);
    const margemMin = Number(pd?.margem_minima || 0);
    if (!pd || custo <= 0) return null;
    const preco = Number(it.preco_un_aplicado || 0);
    const qtd = Number(it.qtd || 0);
    const margemValor = (preco - custo) * qtd;
    const margemPct = custo > 0 ? ((preco - custo) / custo) * 100 : 0;
    const minimo = margemMin > 0 ? custo * (1 + margemMin / 100) : 0;
    return { custo, margemMin, margemValor, margemPct, minimo };
  };

  const handlePrecoBlur = (idx: number, it: any) => {
    const info = getMargemInfo(it);
    if (!info || info.margemMin <= 0) return;
    const preco = Number(it.preco_un_aplicado || 0);
    if (preco < info.minimo) {
      setAlertModal({
        open: true,
        title: "Margem mínima",
        message: `Preço abaixo da margem mínima (${info.margemMin}%). Preço mínimo: R$ ${info.minimo.toFixed(2)}.`,
      });
      updateItem(idx, { preco_un_aplicado: info.minimo });
    }
  };

  const handleTempPrecoBlur = () => {
    const info = getMargemInfo(tempItem);
    if (!info || info.margemMin <= 0) return;
    const preco = Number(tempItem.preco_un_aplicado || 0);
    if (preco < info.minimo) {
      setAlertModal({
        open: true,
        title: "Margem mínima",
        message: `Preço abaixo da margem mínima (${info.margemMin}%). Preço mínimo: R$ ${info.minimo.toFixed(2)}.`,
      });
      setTempItem((prev: any) => ({ ...prev, preco_un_aplicado: info.minimo }));
    }
  };

  const filteredVendas = vendas.filter((v) => {
    if (filterQuery) {
      const term = filterQuery.toLowerCase();
      const codigo = (v.codigo || v.id || "").toLowerCase();
      const clienteNome = (v.cliente?.nome || "").toLowerCase();
      const clienteTelefone = (v.cliente?.contatoTelefone || "").toLowerCase();
      const clienteEmail = (v.cliente?.contatoEmail || "").toLowerCase();
      const matches =
        codigo.includes(term) ||
        clienteNome.includes(term) ||
        clienteTelefone.includes(term) ||
        clienteEmail.includes(term);
      if (!matches) return false;
    }
    if (filterStatus) {
      if (String(v.status || "") !== filterStatus) return false;
    }
    if (filterDataCriacao) {
      const dataVenda = toInputDate(v.data_venda);
      if (dataVenda !== filterDataCriacao) return false;
    }
    if (filterDataEntrega) {
      const dataEntrega = toInputDate(v.data_entrega);
      if (dataEntrega !== filterDataEntrega) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-slate-800">Venda Direta</h3>
          <p className="text-xs text-slate-500">
            Crie pedidos rápidos e gerencie status de entrega e pagamento.
          </p>
        </div>
        <div>
          <button
            onClick={() => {
              setEditingId(null);
              setForm({
                clienteId: "",
                endereco: {},
                itens: [],
                data_entrega: "",
                frete: 0,
                formaPagamento: "DINHEIRO",
                status: "PEDIDO",
              });
              setClienteQuery("");
              setClienteSuggestions([]);
              setProdutoQuery("");
              setProdutoSuggestions([]);
              setModalOpen(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
          >
            <Icons.Plus /> Incluir Venda
          </button>
        </div>
      </div>

      <div className="p-8 space-y-4 max-w-screen-2xl mx-auto w-full animate-fadeIn">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Busca
            </label>
            <input
              className="w-full p-2.5 border rounded-lg"
              placeholder="Número, cliente, telefone ou email..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Data de Criação
            </label>
            <input
              type="date"
              className="w-full p-2.5 border rounded-lg"
              value={filterDataCriacao}
              onChange={(e) => setFilterDataCriacao(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Data de Entrega
            </label>
            <input
              type="date"
              className="w-full p-2.5 border rounded-lg"
              value={filterDataEntrega}
              onChange={(e) => setFilterDataEntrega(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Status
            </label>
            <select
              className="w-full p-2.5 border rounded-lg"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="PEDIDO">Pedido</option>
              <option value="ENVIADO">Enviado</option>
              <option value="ENTREGA">Entrega</option>
              <option value="CONCLUIDO">Concluído</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto bg-white border rounded-lg">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-2 text-xs text-slate-500">
                  Venda / Data
                </th>
                <th className="px-4 py-2 text-xs text-slate-500">Cliente</th>
                <th className="px-4 py-2 text-xs text-slate-500">Itens</th>
                <th className="px-4 py-2 text-xs text-slate-500">Total</th>
                <th className="px-4 py-2 text-xs text-slate-500">Status</th>
                <th className="px-4 py-2 text-xs text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendas.map((v) => (
                <tr key={v.id} className="border-b">
                  <td className="px-4 py-2 text-sm">
                    <div className="font-mono text-xs text-slate-600">
                      {v.codigo || v.id}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDate(v.data_venda)}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <div className="font-medium text-slate-800">
                      {v.cliente?.nome || "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {v.cliente?.contatoTelefone || "-"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {v.cliente?.contatoEmail || "-"}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm">{v.itens?.length || 0}</td>
                  <td className="px-4 py-2 text-sm">
                    {(v.total || 0).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <div className="font-medium text-slate-800">{v.status}</div>
                    {v.data_entrega && (
                      <div className="text-xs text-slate-500">
                        Entrega:{" "}
                        {formatDateOnly(v.data_entrega)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm space-x-2">
                    {v.status !== "CONCLUIDO" && (
                      <>
                        <button
                          className="text-emerald-600 hover:bg-emerald-50 p-2 rounded"
                          title="Concluir"
                          onClick={async () => {
                            setConfirmModal({
                              open: true,
                              title: "Concluir Venda",
                              message: "Confirmar marcar como CONCLUIDO?",
                              onConfirm: async () => {
                                try {
                                  const result = await adminApi.updateVendaStatus(v.id, {
                                    status: "CONCLUIDO",
                                    contaBancariaId: v.contaBancariaId || null,
                                  });
                                  await loadVendas();
                                  showFiscalFeedback(
                                    result,
                                    "Venda concluída com sucesso.",
                                    v,
                                  );
                                } catch (e) {
                                  setAlertModal({
                                    open: true,
                                    title: "Erro",
                                    message: "Erro ao atualizar status.",
                                  });
                                }
                              },
                            });
                          }}
                        >
                          <Icons.Check />
                        </button>
                        <button
                          className="text-blue-600 hover:bg-blue-50 p-2 rounded"
                          title="Editar"
                          onClick={() => {
                            const itemsWithDetails = v.itens.map((it: any) => {
                              const prod =
                                it.produto ||
                                produtos.find((p) => p.id === it.produtoId);
                              return {
                                produtoId: it.produtoId,
                                produtoNome: prod?.nome || "",
                                estoque: prod?.estoque,
                                qtd: it.qtd,
                                preco_un_aplicado: it.preco_un_aplicado,
                                produtoDetalhes: prod ? { produto: prod } : null,
                              };
                            });
                            setEditingId(v.id);
                            setForm({
                              clienteId: v.clienteId || "",
                              endereco: {
                                rua: v.endereco_rua,
                                numero: v.endereco_numero,
                                complemento: v.endereco_complemento,
                                bairro: v.endereco_bairro,
                                cidade: v.endereco_cidade,
                                estado: v.endereco_estado,
                                cep: v.endereco_cep,
                              },
                              itens: itemsWithDetails,
                              data_entrega: v.data_entrega
                                ? toInputDate(v.data_entrega)
                                : "",
                              frete: v.frete || 0,
                              formaPagamento: v.contaBancariaId || "DINHEIRO",
                              status: v.status,
                            });
                            setClienteQuery(v.cliente?.nome || "");
                            setSelectedCliente(
                              v.cliente?.id
                                ? { id: v.cliente.id, nome: v.cliente.nome }
                                : null,
                            );
                            setTempItem({
                              produtoId: "",
                              produtoNome: "",
                              qtd: 1,
                              preco_un_aplicado: 0,
                              precoManual: false,
                              estoque: 0,
                              produtoDetalhes: null,
                            });
                            setModalOpen(true);
                          }}
                        >
                          <Icons.Edit />
                        </button>
                      </>
                    )}
                    <button
                      className="text-slate-600 hover:bg-slate-100 p-2 rounded"
                      title="Detalhes"
                      onClick={() => {
                        setSelectedVenda(v);
                        setDetailsModalOpen(true);
                      }}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    </button>
                    <button
                      className="text-rose-600 hover:bg-rose-50 p-2 rounded"
                      title="Excluir"
                      onClick={async () => {
                        setConfirmModal({
                          open: true,
                          title: "Excluir Venda",
                          message:
                            "Tem certeza que deseja deletar? Isso reposicionará estoque e pagamentos.",
                          onConfirm: async () => {
                            try {
                              await adminApi.deleteVendaDireta(v.id);
                              await loadVendas();
                              setAlertModal({
                                open: true,
                                title: "Venda Direta",
                                message: "Venda deletada com sucesso.",
                              });
                            } catch (e) {
                              setAlertModal({
                                open: true,
                                title: "Erro",
                                message: "Erro ao deletar venda.",
                              });
                            }
                          },
                        });
                      }}
                    >
                      <Icons.Trash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editingId ? "Editar Venda Direta" : "Nova Venda Direta"}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
          setForm({
            clienteId: "",
            endereco: {},
            itens: [],
            data_entrega: "",
            frete: 0,
            formaPagamento: "DINHEIRO",
            status: "PEDIDO",
          });
          setClienteQuery("");
          setClienteSuggestions([]);
          setSelectedCliente(null);
          setProdutoQuery("");
          setProdutoSuggestions([]);
          setTempItem({
            produtoId: "",
            produtoNome: "",
            qtd: 1,
            preco_un_aplicado: 0,
            precoManual: false,
            estoque: 0,
            produtoDetalhes: null,
          });
        }}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="border border-slate-200 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              1. Cliente e Endereço
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Cliente
                </label>
                <input
                  className="w-full p-2.5 border rounded-lg"
                  placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
                  value={clienteQuery}
                  onChange={(e) => {
                    setClienteQuery(e.target.value);
                    setSelectedCliente(null);
                  }}
                />
                {clienteSuggestions.length > 0 && (
                  <div className="border bg-white rounded mt-1 max-h-40 overflow-y-auto">
                    {clienteSuggestions.map((c) => (
                      <div
                        key={c.id}
                        className="p-2 hover:bg-slate-50 cursor-pointer text-sm"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setForm((prev: any) => ({
                            ...prev,
                            clienteId: c.id,
                            endereco: {
                              rua: c.rua,
                              numero: c.numero,
                              complemento: c.complemento,
                              bairro: c.bairro,
                              cidade: c.cidade,
                              estado: c.estado,
                              cep: c.cep,
                            },
                          }));
                          setClienteQuery(c.nome);
                          setSelectedCliente({ id: c.id, nome: c.nome });
                          setClienteSuggestions([]);
                        }}
                    >
                        <div className="font-bold">{c.nome}</div>
                        <div className="text-xs text-slate-500">
                          {c.documento || c.contatoTelefone || ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-6 gap-4">
            <div className="col-span-3">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Rua
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                value={form.endereco?.rua || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    endereco: { ...form.endereco, rua: e.target.value },
                  })
                }
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Número
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                value={form.endereco?.numero || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    endereco: { ...form.endereco, numero: e.target.value },
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Complemento
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                value={form.endereco?.complemento || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    endereco: { ...form.endereco, complemento: e.target.value },
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Bairro
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                value={form.endereco?.bairro || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    endereco: { ...form.endereco, bairro: e.target.value },
                  })
                }
              />
            </div>
            <div className="col-span-3">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Cidade / Estado
              </label>
              <div className="flex gap-2">
                <input
                  className="w-full p-2.5 border rounded-lg"
                  placeholder="Cidade"
                  value={form.endereco?.cidade || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      endereco: { ...form.endereco, cidade: e.target.value },
                    })
                  }
                />
                <input
                  className="w-24 p-2.5 border rounded-lg text-center"
                  placeholder="UF"
                  value={form.endereco?.estado || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      endereco: { ...form.endereco, estado: e.target.value },
                    })
                  }
                />
              </div>
            </div>
            <div className="col-span-1">
              <label className="text-xs font-bold text-slate-500 uppercase">
                CEP
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                value={form.endereco?.cep || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    endereco: { ...form.endereco, cep: e.target.value },
                  })
                }
              />
            </div>
          </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                2. Itens do Pedido
              </h4>
              <button
                type="button"
                onClick={addItem}
                className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm"
              >
                <Icons.Plus /> Adicionar Item
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="col-span-2">
                <input
                  className="w-full p-2.5 border rounded-lg"
                  placeholder="Buscar produto por nome, código ou localização..."
                  value={produtoQuery}
                  onChange={(e) => {
                    setProdutoQuery(e.target.value);
                    if (tempItem.produtoId) {
                      setTempItem((prev: any) => ({
                        ...prev,
                        produtoId: "",
                        produtoNome: "",
                        produtoDetalhes: null,
                      }));
                    }
                  }}
                />
                {tempItem.produtoDetalhes?.produto && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    {tempItem.produtoDetalhes.produto.embalagemTipo
                      ? `${tempItem.produtoDetalhes.produto.embalagemTipo}: ${tempItem.produtoDetalhes.produto.embalagemQuantidade || 0} ${tempItem.produtoDetalhes.produto.embalagemUnidade || ""}`.trim()
                      : "Embalagem: -"}
                  </div>
                )}
                {produtoSuggestions.length > 0 && (
                  <div className="border bg-white rounded mt-1 max-h-40 overflow-y-auto">
                    {produtoSuggestions.map((p) => (
                      <div
                        key={p.id}
                        className="p-2 hover:bg-slate-50 cursor-pointer text-sm"
                        onClick={async () => {
                          try {
                            const detalhes =
                              await adminApi.getProdutoDetalhes(p.id);
                            const qtdAtacado =
                              detalhes.produto.qtd_atacado || 0;
                            const precoInicial =
                              qtdAtacado > 0 && 1 >= qtdAtacado
                                ? detalhes.produto.preco_atacado
                                : detalhes.produto.preco_varejo;
                            setTempItem({
                              produtoId: p.id,
                              produtoNome: p.nome,
                              estoque: detalhes.produto.estoque || 0,
                              preco_un_aplicado: precoInicial,
                              precoManual: false,
                              produtoDetalhes: detalhes,
                              qtd: 1,
                            });
                            setProdutoSuggestions([]);
                            setProdutoQuery(p.nome);
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                      >
                        <div className="font-bold">{p.nome}</div>
                        <div className="text-xs text-slate-500">
                          {p.codigo_barras} — {p.localizacao || ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <input
                  type="number"
                  min={1}
                  className="w-full p-2.5 border rounded-lg"
                  value={tempItem.qtd}
                  onChange={(e) =>
                    setTempItem((prev: any) => {
                      const qtd = parseInt(e.target.value || "1", 10);
                      const pd = prev.produtoDetalhes?.produto;
                      if (pd && !prev.precoManual) {
                        const qtdAtacado = pd.qtd_atacado || 0;
                        const preco =
                          qtdAtacado > 0 && qtd >= qtdAtacado
                            ? pd.preco_atacado
                            : pd.preco_varejo;
                        return { ...prev, qtd, preco_un_aplicado: preco };
                      }
                      return { ...prev, qtd };
                    })
                  }
                />
                {tempItem.estoque !== undefined && (
                  <div className="text-[10px] text-slate-400">
                    Estoque: {tempItem.estoque}
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <CurrencyInput
                  value={tempItem.preco_un_aplicado || 0}
                  onChange={(val) =>
                    setTempItem({
                      ...tempItem,
                      preco_un_aplicado: val,
                      precoManual: true,
                    })
                  }
                  onBlur={handleTempPrecoBlur}
                />
                {getMargemInfo(tempItem) &&
                  getMargemInfo(tempItem)!.margemMin > 0 && (
                    <div className="text-[10px] text-slate-400 mt-1">
                      Mín. aceitável:{" "}
                      {getMargemInfo(tempItem)!.minimo.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}{" "}
                      ({getMargemInfo(tempItem)!.margemMin}%)
                    </div>
                  )}
              </div>

              <div>
                <div className="font-bold">
                  {(
                    (tempItem.preco_un_aplicado || 0) * (tempItem.qtd || 0)
                  ).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </div>
              </div>

              <div></div>
            </div>

            <div className="space-y-3">
              {form.itens.map((it: any, idx: number) => (
                <div key={idx} className="grid grid-cols-7 gap-2 items-center">
                  <div className="col-span-2">
                    <div className="font-bold text-slate-800">
                      {it.produtoNome}
                    </div>
                    {it.produtoDetalhes?.produto && (
                      <div className="text-[10px] text-slate-400 mt-1">
                        {it.produtoDetalhes.produto.embalagemTipo
                          ? `${it.produtoDetalhes.produto.embalagemTipo}: ${it.produtoDetalhes.produto.embalagemQuantidade || 0} ${it.produtoDetalhes.produto.embalagemUnidade || ""}`.trim()
                          : "Embalagem: -"}
                      </div>
                    )}
                  </div>

                  <div>
                    <input
                      type="number"
                      min={1}
                      className="w-full p-2.5 border rounded-lg"
                      value={it.qtd}
                      onChange={(e) =>
                        updateItem(idx, {
                          qtd: parseInt(e.target.value || "1", 10),
                        })
                      }
                    />
                    {it.estoque !== undefined && (
                      <div className="text-[10px] text-slate-400">
                        Estoque: {it.estoque}
                      </div>
                    )}
                  </div>

                  <div className="col-span-2">
                    <CurrencyInput
                      value={it.preco_un_aplicado || 0}
                      onChange={(val) =>
                        updateItem(idx, { preco_un_aplicado: val })
                      }
                      onBlur={() => handlePrecoBlur(idx, it)}
                    />
                    {getMargemInfo(it) && getMargemInfo(it)!.margemMin > 0 && (
                      <div className="text-[10px] text-slate-400 mt-1">
                        Mín. aceitável:{" "}
                        {getMargemInfo(it)!.minimo.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}{" "}
                        ({getMargemInfo(it)!.margemMin}%)
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="font-bold">
                      {(
                        (it.preco_un_aplicado || 0) * (it.qtd || 0)
                      ).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </div>
                    {getMargemInfo(it) && (
                      <div className="text-[10px] text-slate-400">
                        Margem:{" "}
                        {getMargemInfo(it)!.margemValor.toLocaleString(
                          "pt-BR",
                          {
                            style: "currency",
                            currency: "BRL",
                          },
                        )}{" "}
                        ({getMargemInfo(it)!.margemPct.toFixed(0)}%)
                      </div>
                    )}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-rose-500"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              3. Entrega e Pagamento
            </h4>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Frete
                </label>
                <CurrencyInput
                  value={form.frete || 0}
                  onChange={(val) => setForm({ ...form, frete: val })}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Total Geral
                </label>
                <div className="w-full p-2.5 border rounded-lg bg-slate-50 font-bold text-slate-700">
                  {total.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Data de Entrega
                </label>
                <input
                  type="date"
                  className="w-full p-2.5 border rounded-lg"
                  value={form.data_entrega}
                  min={getMinDate()}
                  onChange={(e) =>
                    setForm({ ...form, data_entrega: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Status
                </label>
                <select
                  className="w-full p-2.5 border rounded-lg"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="PEDIDO">
                    Pedido (programação, não pago)
                  </option>
                  <option value="ENVIADO">
                    Enviado (entrega, não pago)
                  </option>
                  <option value="ENTREGA">
                    Entrega (pago, programado)
                  </option>
                  <option value="CONCLUIDO">Concluído (pago e entregue)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Forma de Pagamento
                </label>
                <select
                  className="w-full p-2.5 border rounded-lg"
                  value={form.formaPagamento}
                  onChange={(e) =>
                    setForm({ ...form, formaPagamento: e.target.value })
                  }
                >
                  <option value="DINHEIRO">Dinheiro</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} - {c.tipo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4">
            <div>
              <div className="text-sm text-slate-500">
                Subtotal:{" "}
                <span className="font-bold">
                  {subtotal.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </div>
              <div className="text-sm text-slate-500">
                Total:{" "}
                <span className="font-bold text-lg">
                  {total.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border"
              >
                Cancelar
              </button>
              <button className="px-4 py-2 rounded-lg bg-emerald-600 text-white">
                {editingId ? "Atualizar Venda" : "Salvar Venda"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={alertModal.open}
        title={alertModal.title}
        onClose={() => setAlertModal({ open: false, title: "", message: "" })}
      >
        <div className="space-y-6 text-center">
          <p className="text-slate-600 whitespace-pre-wrap">
            {alertModal.message}
          </p>
          <div className="flex justify-center">
            <button
              className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700"
              onClick={() =>
                setAlertModal({ open: false, title: "", message: "" })
              }
            >
              OK
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmModal.open}
        title={confirmModal.title}
        onClose={() =>
          setConfirmModal({
            open: false,
            title: "",
            message: "",
            onConfirm: () => {},
          })
        }
      >
        <div className="space-y-6 text-center">
          <p className="text-slate-600 whitespace-pre-wrap">
            {confirmModal.message}
          </p>
          <div className="flex justify-center gap-4">
            <button
              className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
              onClick={() =>
                setConfirmModal({
                  open: false,
                  title: "",
                  message: "",
                  onConfirm: () => {},
                })
              }
            >
              Cancelar
            </button>
            <button
              className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700"
              onClick={() => {
                confirmModal.onConfirm();
                setConfirmModal({
                  open: false,
                  title: "",
                  message: "",
                  onConfirm: () => {},
                });
              }}
            >
              Confirmar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={detailsModalOpen}
        title="Detalhes da Venda Direta"
        onClose={() => {
          setDetailsModalOpen(false);
          setSelectedVenda(null);
        }}
      >
        {!selectedVenda ? (
          <div className="p-6 text-center text-slate-400">
            Carregando...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-400 uppercase">Código</div>
                <div className="font-mono font-bold">
                  {selectedVenda.codigo || selectedVenda.id}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase">Status</div>
                <div className="font-bold">{selectedVenda.status}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase">Cliente</div>
                <div className="font-bold">
                  {selectedVenda.cliente?.nome || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase">
                  Data da Venda
                </div>
                <div>{formatDate(selectedVenda.data_venda)}</div>
              </div>
            </div>

            {(selectedVenda.status === "PEDIDO" ||
              selectedVenda.status === "ENTREGA") && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                <div className="text-xs text-slate-400 uppercase mb-1">
                  Entrega
                </div>
                <div className="font-medium">
                  {selectedVenda.data_entrega
                    ? formatDateOnly(selectedVenda.data_entrega)
                    : "Sem data"}
                </div>
                <div className="text-slate-600 text-xs mt-1">
                  {selectedVenda.endereco_rua
                    ? `${selectedVenda.endereco_rua}, ${selectedVenda.endereco_numero || ""}`
                    : "Endereço não informado"}
                </div>
                <div className="text-slate-500 text-xs">
                  {selectedVenda.endereco_bairro || "-"} •{" "}
                  {selectedVenda.endereco_cidade || "-"} /{" "}
                  {selectedVenda.endereco_estado || "-"} •{" "}
                  {selectedVenda.endereco_cep || "-"}
                </div>
              </div>
            )}

            {selectedVenda.status === "ENVIADO" && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                Produto em entrega.
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Qtd</th>
                    <th className="p-3">Unitário</th>
                    <th className="p-3">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedVenda.itens?.map((it: any) => (
                    <tr key={it.id}>
                      <td className="p-3">
                        {it.produto?.nome || it.produtoNome || "—"}
                      </td>
                      <td className="p-3">{it.qtd}</td>
                      <td className="p-3">
                        {Number(it.preco_un_aplicado || 0).toLocaleString(
                          "pt-BR",
                          { style: "currency", currency: "BRL" },
                        )}
                      </td>
                      <td className="p-3">
                        {(Number(it.preco_un_aplicado || 0) *
                          Number(it.qtd || 0)).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </td>
                    </tr>
                  ))}
                  {(!selectedVenda.itens ||
                    selectedVenda.itens.length === 0) && (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-4 text-center text-slate-400"
                      >
                        Nenhum item.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end text-sm">
              <div className="text-right">
                <div className="text-slate-500">
                  Frete:{" "}
                  <span className="font-bold">
                    {Number(selectedVenda.frete || 0).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
                <div className="text-slate-700 text-lg font-bold">
                  Total:{" "}
                  {Number(selectedVenda.total || 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

