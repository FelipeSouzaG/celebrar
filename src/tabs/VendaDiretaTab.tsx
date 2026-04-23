import { FormEvent, useEffect, useMemo, useState } from "react";
import { adminApi } from "../api";
import { Icons } from "../components/Icons";
import { CurrencyInput, Modal } from "../components/Shared";
import logoLoja from "../img/logo.png";
import {
  Cliente,
  ContaBancaria,
  NfeResult,
  Produto,
  VendaDiretaMutationResponse,
  VendaFiscalXmlResponse,
} from "../types";
import { formatDate, formatDateOnly, toInputDate } from "../utils";

const CATALOGO_CATEGORIAS = ["Festas", "Embalagens", "Doces"] as const;

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
  const [detailsTab, setDetailsTab] = useState<"venda" | "notaFiscal">("venda");
  const [filterQuery, setFilterQuery] = useState("");
  const [filterDataCriacao, setFilterDataCriacao] = useState("");
  const [filterDataEntrega, setFilterDataEntrega] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);

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

  const getXmlTagBlocks = (xml: string, tag: string) => {
    if (!xml) return [];
    const rgx = new RegExp(
      `<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`,
      "gi",
    );
    const blocks: string[] = [];
    let match: RegExpExecArray | null = rgx.exec(xml);
    while (match) {
      blocks.push(String(match[1] || "").trim());
      match = rgx.exec(xml);
    }
    return blocks;
  };

  const getXmlTagBlock = (xml: string, tag: string) =>
    getXmlTagBlocks(xml, tag)[0] || "";

  const getXmlTagValue = (xml: string, tag: string) =>
    getXmlTagBlock(xml, tag)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .trim();

  const mapNfeTpagLabel = (code?: string) => {
    const normalized = String(code || "").trim();
    if (normalized === "01") return "Dinheiro";
    if (normalized === "02") return "Cheque";
    if (normalized === "03") return "Cartão de Crédito";
    if (normalized === "04") return "Cartão de Débito";
    if (normalized === "05") return "Crédito Loja";
    if (normalized === "10") return "Vale Alimentação";
    if (normalized === "11") return "Vale Refeição";
    if (normalized === "12") return "Vale Presente";
    if (normalized === "13") return "Vale Combustível";
    if (normalized === "15") return "Boleto Bancário";
    if (normalized === "16") return "Depósito Bancário";
    if (normalized === "17") return "PIX";
    if (normalized === "18") return "Transferência Bancária";
    if (normalized === "19") return "Programa de Fidelidade";
    if (normalized === "90") return "Sem pagamento";
    if (normalized === "99") return "Outros";
    return resolvePagamentoLabel(normalized || "-");
  };

  const toNumber = (value: any) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? "").trim();
    if (!raw) return 0;
    const normalized = raw.includes(",")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatMoney = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatDateTime = (value?: string) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString("pt-BR");
  };

  const formatDateOnly = (value?: string) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("pt-BR");
  };

  const normalizeDigits = (value: any) => String(value || "").replace(/\D/g, "");

  const formatCpfCnpj = (value: any) => {
    const digits = normalizeDigits(value);
    if (digits.length === 11) {
      return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
    if (digits.length === 14) {
      return digits.replace(
        /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
        "$1.$2.$3/$4-$5",
      );
    }
    return String(value || "-");
  };

  const formatCep = (value: any) => {
    const digits = normalizeDigits(value);
    if (digits.length === 8) {
      return digits.replace(/(\d{5})(\d{3})/, "$1-$2");
    }
    return String(value || "-");
  };

  const formatPhone = (value: any) => {
    const digits = normalizeDigits(value);
    if (digits.length === 11) {
      return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    }
    if (digits.length === 10) {
      return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    }
    return String(value || "-");
  };

  const formatChaveAcesso = (value: any) => {
    const digits = normalizeDigits(value);
    if (!digits) return "-";
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  };

  const getModFreteLabel = (value?: string) => {
    const code = String(value || "").trim();
    if (code === "0") return "0 - Remetente (CIF)";
    if (code === "1") return "1 - Destinatário (FOB)";
    if (code === "2") return "2 - Terceiros";
    if (code === "3") return "3 - Próprio remetente";
    if (code === "4") return "4 - Próprio destinatário";
    if (code === "9") return "9 - Sem frete";
    return code ? `${code} - Não informado` : "-";
  };

  const buildBarcodeDataUri = (value: string) => {
    const digits = normalizeDigits(value);
    if (!digits) return "";
    const map = [1, 2, 1, 3, 2, 1, 2, 3, 1, 2];
    const bars: number[] = [2, 1, 2, 1];
    for (const d of digits) {
      const n = Number(d);
      const w1 = map[n % map.length];
      const w2 = map[(n + 3) % map.length];
      bars.push(w1, 1, w2, 1);
    }
    bars.push(3, 1, 2, 1, 2);
    const unit = 1.15;
    const height = 52;
    const totalWidth =
      bars.reduce((acc, v) => acc + v, 0) * unit + 16;
    let x = 8;
    const rects: string[] = [];
    for (let i = 0; i < bars.length; i += 1) {
      const width = bars[i] * unit;
      if (i % 2 === 0) {
        rects.push(
          `<rect x="${x.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="${height}" fill="#000"/>`,
        );
      }
      x += width;
    }
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${totalWidth.toFixed(2)}' height='${height}' viewBox='0 0 ${totalWidth.toFixed(2)} ${height}'>${rects.join("")}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const buildNfeFromFiscalXml = (
    fiscal: VendaFiscalXmlResponse,
    venda: any,
  ): NfeResult => {
    const xml = fiscal?.xml || "";
    const ideBlock = getXmlTagBlock(xml, "ide");
    const emitBlock = getXmlTagBlock(xml, "emit");
    const enderEmitBlock = getXmlTagBlock(emitBlock, "enderEmit");
    const destBlock = getXmlTagBlock(xml, "dest");
    const enderDestBlock = getXmlTagBlock(destBlock, "enderDest");
    const transpBlock = getXmlTagBlock(xml, "transp");
    const transportaBlock = getXmlTagBlock(transpBlock, "transporta");
    const veicTranspBlock = getXmlTagBlock(transpBlock, "veicTransp");
    const volBlocks = getXmlTagBlocks(transpBlock, "vol");
    const icmsTotBlock = getXmlTagBlock(xml, "ICMSTot");
    const infAdicBlock = getXmlTagBlock(xml, "infAdic");
    const dhEmi = getXmlTagValue(xml, "dhEmi");
    const dhSaiEnt = getXmlTagValue(xml, "dhSaiEnt");
    const naturezaOperacao = getXmlTagValue(xml, "natOp");
    const consultaUrl = getXmlTagValue(xml, "urlChave");
    const numero =
      Number(fiscal.numero || getXmlTagValue(xml, "nNF") || 0) || 0;
    const serie =
      Number(fiscal.serie || getXmlTagValue(xml, "serie") || 0) || 0;
    const detBlocks = getXmlTagBlocks(xml, "det");
    const detPagBlocks = getXmlTagBlocks(xml, "detPag");
    const dupBlocks = getXmlTagBlocks(xml, "dup");
    const itensXml = detBlocks.map((det) => {
      const prod = getXmlTagBlock(det, "prod");
      const imposto = getXmlTagBlock(det, "imposto");
      const icms = getXmlTagBlock(imposto, "ICMS");
      const pis = getXmlTagBlock(imposto, "PIS");
      const cofins = getXmlTagBlock(imposto, "COFINS");
      return {
        codigo: getXmlTagValue(prod, "cProd") || undefined,
        descricao: getXmlTagValue(prod, "xProd") || undefined,
        ncm: getXmlTagValue(prod, "NCM") || undefined,
        cfop: getXmlTagValue(prod, "CFOP") || undefined,
        unidade:
          getXmlTagValue(prod, "uCom") ||
          getXmlTagValue(prod, "uTrib") ||
          undefined,
        quantidade:
          getXmlTagValue(prod, "qCom") ||
          getXmlTagValue(prod, "qTrib") ||
          undefined,
        valorUnitario:
          getXmlTagValue(prod, "vUnCom") ||
          getXmlTagValue(prod, "vUnTrib") ||
          undefined,
        valorTotal: getXmlTagValue(prod, "vProd") || undefined,
        csosn:
          getXmlTagValue(icms, "CSOSN") ||
          getXmlTagValue(icms, "CST") ||
          undefined,
        cstPis: getXmlTagValue(pis, "CST") || undefined,
        cstCofins: getXmlTagValue(cofins, "CST") || undefined,
      };
    });

    const pagamentoDetalhes = detPagBlocks.map((detPag) => ({
      tPag: getXmlTagValue(detPag, "tPag") || undefined,
      vPag: getXmlTagValue(detPag, "vPag") || undefined,
    }));
    const pagamentoPrincipal: { tPag?: string; vPag?: string } =
      pagamentoDetalhes[0] || {};
    const pagamentoTotal = pagamentoDetalhes.reduce(
      (acc, p) => acc + toNumber(p.vPag),
      0,
    );
    const volumePrincipal = volBlocks[0] || "";
    const volumesSomados = volBlocks.reduce(
      (acc, vol) => acc + toNumber(getXmlTagValue(vol, "qVol")),
      0,
    );
    const pedidoInterno =
      getXmlTagValue(getXmlTagBlock(detBlocks[0] || "", "prod"), "xPed") ||
      undefined;

    return {
      enabled: true,
      attempted: true,
      authorized: String(fiscal.statusCode || "").trim() === "100",
      homologacao: getXmlTagValue(xml, "tpAmb") === "2",
      naturezaOperacao: naturezaOperacao || "VENDA DIRETA",
      dataEmissao: dhEmi || venda?.data_venda,
      dataSaidaEntrada: dhSaiEnt || undefined,
      chaveAcesso: fiscal.chaveAcesso || getXmlTagValue(xml, "chNFe"),
      numero: numero || undefined,
      serie: serie || undefined,
      tipoOperacao: getXmlTagValue(ideBlock, "tpNF") || undefined,
      protocolo: fiscal.protocolo || getXmlTagValue(xml, "nProt"),
      dataAutorizacao:
        fiscal.dataAutorizacao || getXmlTagValue(xml, "dhRecbto") || undefined,
      statusCode: fiscal.statusCode || undefined,
      statusMessage: fiscal.statusMessage || undefined,
      consultaUrl: consultaUrl || undefined,
      emitente: {
        nome: getXmlTagValue(emitBlock, "xNome") || undefined,
        fantasia: getXmlTagValue(emitBlock, "xFant") || undefined,
        cnpj: getXmlTagValue(emitBlock, "CNPJ") || undefined,
        cpf: getXmlTagValue(emitBlock, "CPF") || undefined,
        crt: getXmlTagValue(emitBlock, "CRT") || undefined,
        ie: getXmlTagValue(emitBlock, "IE") || undefined,
        fone: getXmlTagValue(enderEmitBlock, "fone") || undefined,
        endereco: {
          logradouro: getXmlTagValue(enderEmitBlock, "xLgr") || undefined,
          numero: getXmlTagValue(enderEmitBlock, "nro") || undefined,
          complemento: getXmlTagValue(enderEmitBlock, "xCpl") || undefined,
          bairro: getXmlTagValue(enderEmitBlock, "xBairro") || undefined,
          cidade: getXmlTagValue(enderEmitBlock, "xMun") || undefined,
          uf: getXmlTagValue(enderEmitBlock, "UF") || undefined,
          cep: getXmlTagValue(enderEmitBlock, "CEP") || undefined,
        },
      },
      destinatario: {
        nome:
          getXmlTagValue(destBlock, "xNome") ||
          venda?.cliente?.nome ||
          undefined,
        documento:
          getXmlTagValue(destBlock, "CNPJ") ||
          getXmlTagValue(destBlock, "CPF") ||
          undefined,
        documentoTipo: getXmlTagValue(destBlock, "CNPJ")
          ? "CNPJ"
          : getXmlTagValue(destBlock, "CPF")
            ? "CPF"
            : undefined,
        ie: getXmlTagValue(destBlock, "IE") || undefined,
        fone: getXmlTagValue(enderDestBlock, "fone") || undefined,
        endereco: {
          logradouro: getXmlTagValue(enderDestBlock, "xLgr") || undefined,
          numero: getXmlTagValue(enderDestBlock, "nro") || undefined,
          complemento: getXmlTagValue(enderDestBlock, "xCpl") || undefined,
          bairro: getXmlTagValue(enderDestBlock, "xBairro") || undefined,
          cidade: getXmlTagValue(enderDestBlock, "xMun") || undefined,
          uf: getXmlTagValue(enderDestBlock, "UF") || undefined,
          cep: getXmlTagValue(enderDestBlock, "CEP") || undefined,
        },
      },
      totais: {
        vBC: getXmlTagValue(icmsTotBlock, "vBC") || undefined,
        vICMS: getXmlTagValue(icmsTotBlock, "vICMS") || undefined,
        vBCST: getXmlTagValue(icmsTotBlock, "vBCST") || undefined,
        vST: getXmlTagValue(icmsTotBlock, "vST") || undefined,
        vProd: getXmlTagValue(icmsTotBlock, "vProd") || undefined,
        vFrete: getXmlTagValue(icmsTotBlock, "vFrete") || undefined,
        vSeg: getXmlTagValue(icmsTotBlock, "vSeg") || undefined,
        vDesc: getXmlTagValue(icmsTotBlock, "vDesc") || undefined,
        vOutro: getXmlTagValue(icmsTotBlock, "vOutro") || undefined,
        vIPI: getXmlTagValue(icmsTotBlock, "vIPI") || undefined,
        vNF: getXmlTagValue(icmsTotBlock, "vNF") || undefined,
        vTotTrib: getXmlTagValue(icmsTotBlock, "vTotTrib") || undefined,
      },
      transporte: {
        modFrete: getXmlTagValue(transpBlock, "modFrete") || undefined,
        transportadora: getXmlTagValue(transportaBlock, "xNome") || undefined,
        documento:
          getXmlTagValue(transportaBlock, "CNPJ") ||
          getXmlTagValue(transportaBlock, "CPF") ||
          undefined,
        placa: getXmlTagValue(veicTranspBlock, "placa") || undefined,
        ufPlaca: getXmlTagValue(veicTranspBlock, "UF") || undefined,
        quantidadeVolumes:
          (volumesSomados > 0 ? String(volumesSomados) : "") ||
          getXmlTagValue(volumePrincipal, "qVol") ||
          undefined,
        pesoBruto: getXmlTagValue(volumePrincipal, "pesoB") || undefined,
        pesoLiquido: getXmlTagValue(volumePrincipal, "pesoL") || undefined,
      },
      pagamento: {
        tPag: pagamentoPrincipal.tPag || getXmlTagValue(xml, "tPag") || undefined,
        vPag:
          (pagamentoTotal > 0 ? String(pagamentoTotal) : "") ||
          pagamentoPrincipal.vPag ||
          getXmlTagValue(xml, "vPag") ||
          undefined,
        detalhes: pagamentoDetalhes,
        parcelas: dupBlocks.map((dup) => ({
          numero: getXmlTagValue(dup, "nDup") || undefined,
          vencimento: getXmlTagValue(dup, "dVenc") || undefined,
          valor: getXmlTagValue(dup, "vDup") || undefined,
        })),
      },
      informacoesAdicionais: {
        infCpl: getXmlTagValue(infAdicBlock, "infCpl") || undefined,
        infAdFisco: getXmlTagValue(infAdicBlock, "infAdFisco") || undefined,
        pedidoInterno: pedidoInterno,
      },
      itens: itensXml,
    };
  };

  const openDanfeA4 = (
    nfe: NfeResult,
    venda: any,
    options?: { autoPrint?: boolean },
  ) => {
    if (!nfe?.authorized) return;
    const autoPrint = options?.autoPrint !== false;
    const itensXml = Array.isArray(nfe.itens) ? nfe.itens : [];
    const itensVenda = Array.isArray(venda?.itens) ? venda.itens : [];
    const itens =
      itensXml.length > 0
        ? itensXml
        : itensVenda.map((it: any, idx: number) => ({
            codigo:
              it?.produto?.codigo_barras || it?.produtoId || String(idx + 1),
            descricao: it?.produto?.nome || it?.produtoNome || "Item",
            ncm: it?.ncm || it?.produto?.ncm || "-",
            cfop: it?.cfop_aplicado || "-",
            csosn: it?.csosn_aplicado || "-",
            unidade: it?.produto?.embalagemUnidade || "UN",
            quantidade: String(it?.qtd || 0),
            valorUnitario: String(it?.preco_un_aplicado || 0),
            valorTotal: String(
              Number(it?.qtd || 0) * Number(it?.preco_un_aplicado || 0),
            ),
          }));

    const emit = nfe.emitente || {};
    const emitEndereco = emit.endereco || {};
    const cliente = venda?.cliente || {};
    const dest = nfe.destinatario || {};
    const destEndereco = dest.endereco || {};
    const totais = nfe.totais || {};
    const transporte = nfe.transporte || {};
    const pagamento = nfe.pagamento || {};
    const infos = nfe.informacoesAdicionais || {};
    const chaveAcesso = normalizeDigits(nfe.chaveAcesso);

    const empresaNome = emit.nome || "Emitente não informado";
    const empresaFantasia = emit.fantasia || "-";
    const empresaDocumento = formatCpfCnpj(emit.cnpj || emit.cpf || "-");
    const empresaTelefone = formatPhone(emit.fone || "-");
    const empresaEndereco = [
      emitEndereco.logradouro || "-",
      emitEndereco.numero || "S/N",
      emitEndereco.complemento || "",
    ]
      .filter(Boolean)
      .join(", ");
    const empresaCidadeUf = [
      emitEndereco.cidade || "-",
      emitEndereco.uf || "",
      formatCep(emitEndereco.cep || "-"),
    ]
      .filter(Boolean)
      .join(" / ");

    const documentoDest =
      normalizeDigits(dest.documento) ||
      normalizeDigits(cliente?.documento) ||
      "-";
    const documentoDestTipo =
      dest.documentoTipo ||
      (normalizeDigits(dest.documento).length === 14
        ? "CNPJ"
        : normalizeDigits(dest.documento).length === 11
          ? "CPF"
          : "CPF/CNPJ");
    const enderecoDestLinha = [
      destEndereco.logradouro || venda?.endereco_rua || cliente?.rua || "-",
      destEndereco.numero || venda?.endereco_numero || cliente?.numero || "S/N",
      destEndereco.complemento ||
        venda?.endereco_complemento ||
        cliente?.complemento ||
        "",
    ]
      .filter(Boolean)
      .join(", ");

    const bairroDest =
      destEndereco.bairro || venda?.endereco_bairro || cliente?.bairro || "-";
    const cidadeDest =
      destEndereco.cidade || venda?.endereco_cidade || cliente?.cidade || "-";
    const ufDest = destEndereco.uf || venda?.endereco_estado || cliente?.estado || "-";
    const cepDest = formatCep(destEndereco.cep || venda?.endereco_cep || cliente?.cep || "-");
    const telefoneDest = formatPhone(dest.fone || cliente?.telefone || "-");

    const dataEmissao = formatDateTime(nfe.dataEmissao);
    const dataSaidaEntrada = formatDateTime(nfe.dataSaidaEntrada);
    const dataAutorizacao = formatDateTime(nfe.dataAutorizacao);
    const protocoloAutorizacao = nfe.protocolo || "-";
    const serieNota = nfe.serie ?? "-";
    const numeroNota = nfe.numero ?? "-";
    const naturezaOperacao = nfe.naturezaOperacao || "-";
    const tipoOperacao =
      String(nfe.tipoOperacao || "").trim() === "0"
        ? "0 - Entrada"
        : String(nfe.tipoOperacao || "").trim() === "1"
          ? "1 - Saída"
          : "-";
    const ambiente = nfe.homologacao ? "Homologação" : "Produção";
    const barcodeDataUri = buildBarcodeDataUri(chaveAcesso);

    const valorBaseIcms = toNumber(totais.vBC);
    const valorIcms = toNumber(totais.vICMS);
    const valorBaseIcmsSt = toNumber(totais.vBCST);
    const valorIcmsSt = toNumber(totais.vST);
    const valorProdutos = toNumber(totais.vProd);
    const valorFrete = toNumber(totais.vFrete);
    const valorSeguro = toNumber(totais.vSeg);
    const valorDesconto = toNumber(totais.vDesc);
    const valorOutros = toNumber(totais.vOutro);
    const valorIpi = toNumber(totais.vIPI);
    const valorTotalNota = toNumber(totais.vNF);
    const valorTotTrib = toNumber(totais.vTotTrib);

    const pagamentoDetalhes = Array.isArray(pagamento.detalhes)
      ? pagamento.detalhes
      : [];
    const parcelas = Array.isArray(pagamento.parcelas) ? pagamento.parcelas : [];

    const pagamentoRows =
      pagamentoDetalhes.length > 0
        ? pagamentoDetalhes
            .map(
              (item) => `<tr>
          <td>${escapeHtml(mapNfeTpagLabel(item.tPag))}</td>
          <td class="right">${formatMoney(toNumber(item.vPag))}</td>
        </tr>`,
            )
            .join("")
        : `<tr>
          <td>${escapeHtml(mapNfeTpagLabel(pagamento.tPag))}</td>
          <td class="right">${formatMoney(toNumber(pagamento.vPag || valorTotalNota))}</td>
        </tr>`;

    const parcelasRows =
      parcelas.length > 0
        ? parcelas
            .map(
              (item) => `<tr>
          <td>${escapeHtml(item.numero || "-")}</td>
          <td class="center">${escapeHtml(formatDateOnly(item.vencimento))}</td>
          <td class="right">${formatMoney(toNumber(item.valor))}</td>
        </tr>`,
            )
            .join("")
        : `<tr><td colspan="3" class="center">Sem parcelas no XML.</td></tr>`;

    const itensPorPaginaPrimeira = 14;
    const itensPorPaginaDemais = 22;
    const paginasItens: any[][] = [];
    if (itens.length <= itensPorPaginaPrimeira) {
      paginasItens.push(itens);
    } else {
      paginasItens.push(itens.slice(0, itensPorPaginaPrimeira));
      let cursor = itensPorPaginaPrimeira;
      while (cursor < itens.length) {
        paginasItens.push(itens.slice(cursor, cursor + itensPorPaginaDemais));
        cursor += itensPorPaginaDemais;
      }
    }
    if (paginasItens.length === 0) paginasItens.push([]);

    const totalPaginas = paginasItens.length;

    const buildItemRows = (rows: any[]) =>
      rows
        .map((it: any) => {
          const qtd = toNumber(it?.quantidade);
          return `<tr>
          <td>${escapeHtml(it?.codigo || "-")}</td>
          <td class="wrap">${escapeHtml(it?.descricao || "-")}</td>
          <td>${escapeHtml(it?.ncm || "-")}</td>
          <td>${escapeHtml(it?.csosn || "-")}</td>
          <td>${escapeHtml(it?.cfop || "-")}</td>
          <td class="center">${escapeHtml(it?.unidade || "UN")}</td>
          <td class="right">${qtd.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
          <td class="right">${formatMoney(toNumber(it?.valorUnitario))}</td>
          <td class="right">${formatMoney(toNumber(it?.valorTotal))}</td>
        </tr>`;
        })
        .join("");

    const consultaUrl =
      nfe.consultaUrl || "www.nfe.fazenda.gov.br/portal";

    const pagesHtml = paginasItens
      .map((paginaItens, pageIdx) => {
        const numeroPagina = pageIdx + 1;
        const isUltima = numeroPagina === totalPaginas;
        return `<section class="page">
        <div class="header-grid">
          <div class="box company">
            <img src="${logoLoja}" alt="Logo da empresa" class="logo" />
            <div class="company-content">
              <div class="company-name">${escapeHtml(empresaNome)}</div>
              <div class="row"><b>Nome fantasia:</b> ${escapeHtml(empresaFantasia)}</div>
              <div class="row"><b>Endereço:</b> ${escapeHtml(empresaEndereco)}</div>
              <div class="row"><b>Cidade/UF/CEP:</b> ${escapeHtml(empresaCidadeUf)}</div>
              <div class="row"><b>Telefone:</b> ${escapeHtml(empresaTelefone)}</div>
              <div class="row"><b>CNPJ:</b> ${escapeHtml(empresaDocumento)}</div>
              <div class="row"><b>Inscrição Estadual:</b> ${escapeHtml(emit.ie || "-")}</div>
            </div>
          </div>
          <div class="box nfe-box">
            <div class="danfe-title">DANFE</div>
            <div class="sub-title">Documento Auxiliar da Nota Fiscal Eletrônica</div>
            <div class="nfe-grid">
              <div><b>Tipo operação</b><span>${escapeHtml(tipoOperacao)}</span></div>
              <div><b>Número</b><span>${escapeHtml(String(numeroNota))}</span></div>
              <div><b>Série</b><span>${escapeHtml(String(serieNota))}</span></div>
              <div><b>Página</b><span>${escapeHtml(`${numeroPagina}/${totalPaginas}`)}</span></div>
            </div>
          </div>
          <div class="box key-box">
            <div class="row key-title"><b>Chave de acesso</b></div>
            <div class="key-value">${escapeHtml(formatChaveAcesso(chaveAcesso || "-"))}</div>
            ${
              barcodeDataUri
                ? `<div class="barcode-wrap"><img src="${barcodeDataUri}" alt="Código de barras da chave de acesso" class="barcode" /></div>`
                : ""
            }
            <div class="consulta">
              Consulta de autenticidade no portal nacional da NF-e<br/>
              ${escapeHtml(consultaUrl)}
            </div>
          </div>
        </div>

        <div class="box">
          <div class="section-title">Destinatário / Remetente</div>
          <div class="grid dest-grid">
            <div><b>Nome / Razão Social</b><span>${escapeHtml(dest.nome || cliente?.nome || "-")}</span></div>
            <div><b>${escapeHtml(documentoDestTipo)}</b><span>${escapeHtml(formatCpfCnpj(documentoDest || "-"))}</span></div>
            <div><b>Inscrição Estadual</b><span>${escapeHtml(dest.ie || "-")}</span></div>
            <div><b>Data emissão</b><span>${escapeHtml(dataEmissao)}</span></div>
            <div><b>Data saída/entrada</b><span>${escapeHtml(dataSaidaEntrada)}</span></div>
            <div class="span3"><b>Endereço completo</b><span>${escapeHtml(enderecoDestLinha)}</span></div>
            <div><b>Bairro</b><span>${escapeHtml(bairroDest)}</span></div>
            <div><b>Cidade</b><span>${escapeHtml(cidadeDest)}</span></div>
            <div><b>UF</b><span>${escapeHtml(ufDest)}</span></div>
            <div><b>CEP</b><span>${escapeHtml(cepDest)}</span></div>
            <div><b>Telefone</b><span>${escapeHtml(telefoneDest)}</span></div>
          </div>
        </div>

        <div class="box">
          <div class="section-title">Produtos / Itens</div>
          <table class="items">
            <thead>
              <tr>
                <th style="width: 10%;">Código</th>
                <th style="width: 30%;">Descrição</th>
                <th style="width: 8%;">NCM</th>
                <th style="width: 8%;">CST/CSOSN</th>
                <th style="width: 8%;">CFOP</th>
                <th style="width: 6%;" class="center">UN</th>
                <th style="width: 10%;" class="right">Quantidade</th>
                <th style="width: 10%;" class="right">Valor Unitário</th>
                <th style="width: 10%;" class="right">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              ${
                paginaItens.length > 0
                  ? buildItemRows(paginaItens)
                  : `<tr><td colspan="9" class="center">Sem itens no XML da NF-e.</td></tr>`
              }
            </tbody>
          </table>
        </div>

        ${
          isUltima
            ? `<div class="box">
          <div class="section-title">Cálculo do Imposto</div>
          <div class="grid tax-grid">
            <div><b>Base ICMS</b><span>${formatMoney(valorBaseIcms)}</span></div>
            <div><b>Valor ICMS</b><span>${formatMoney(valorIcms)}</span></div>
            <div><b>Base ICMS ST</b><span>${formatMoney(valorBaseIcmsSt)}</span></div>
            <div><b>Valor ICMS ST</b><span>${formatMoney(valorIcmsSt)}</span></div>
            <div><b>Valor Produtos</b><span>${formatMoney(valorProdutos)}</span></div>
            <div><b>Frete</b><span>${formatMoney(valorFrete)}</span></div>
            <div><b>Seguro</b><span>${formatMoney(valorSeguro)}</span></div>
            <div><b>Desconto</b><span>${formatMoney(valorDesconto)}</span></div>
            <div><b>Outras Despesas</b><span>${formatMoney(valorOutros)}</span></div>
            <div><b>IPI</b><span>${formatMoney(valorIpi)}</span></div>
            <div><b>Valor Total da Nota</b><span>${formatMoney(valorTotalNota)}</span></div>
          </div>
        </div>

        <div class="box">
          <div class="section-title">Transporte</div>
          <div class="grid transport-grid">
            <div><b>Modalidade frete</b><span>${escapeHtml(getModFreteLabel(transporte.modFrete))}</span></div>
            <div><b>Transportadora</b><span>${escapeHtml(transporte.transportadora || "-")}</span></div>
            <div><b>CNPJ/CPF</b><span>${escapeHtml(formatCpfCnpj(transporte.documento || "-"))}</span></div>
            <div><b>Placa</b><span>${escapeHtml(transporte.placa || "-")}</span></div>
            <div><b>UF placa</b><span>${escapeHtml(transporte.ufPlaca || "-")}</span></div>
            <div><b>Quantidade volumes</b><span>${escapeHtml(transporte.quantidadeVolumes || "-")}</span></div>
            <div><b>Peso bruto</b><span>${escapeHtml(transporte.pesoBruto || "-")}</span></div>
            <div><b>Peso líquido</b><span>${escapeHtml(transporte.pesoLiquido || "-")}</span></div>
          </div>
        </div>

        <div class="double-grid">
          <div class="box">
            <div class="section-title">Pagamento</div>
            <table>
              <thead>
                <tr>
                  <th>Forma de pagamento</th>
                  <th class="right">Valor pago</th>
                </tr>
              </thead>
              <tbody>
                ${pagamentoRows}
              </tbody>
            </table>
            <div class="box-inner-title">Parcelas</div>
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th class="center">Vencimento</th>
                  <th class="right">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${parcelasRows}
              </tbody>
            </table>
          </div>
          <div class="box">
            <div class="section-title">Informações Adicionais</div>
            <div class="info-list"><b>Empresa optante pelo Simples Nacional:</b> ${emit.crt === "1" ? "Sim" : "Não/Não informado"}</div>
            <div class="info-list"><b>Tributos aproximados:</b> ${formatMoney(valorTotTrib)} (Fonte IBPT)</div>
            <div class="info-list"><b>Pedido interno:</b> ${escapeHtml(infos.pedidoInterno || "-")}</div>
            <div class="info-list"><b>Observações comerciais:</b> ${escapeHtml(infos.infCpl || "-")}</div>
            <div class="info-list"><b>Dados bancários:</b> -</div>
          </div>
        </div>

        <div class="box footer-box">
          <div><b>Protocolo de autorização:</b> ${escapeHtml(protocoloAutorizacao)}</div>
          <div><b>Data/hora autorização:</b> ${escapeHtml(dataAutorizacao)}</div>
          <div><b>Ambiente:</b> ${escapeHtml(ambiente)}</div>
          <div><b>Natureza da operação:</b> ${escapeHtml(naturezaOperacao)}</div>
          <div><b>Informação fiscal complementar:</b> ${escapeHtml(infos.infAdFisco || "-")}</div>
        </div>

        <div class="canhoto">
          <div><b>Canhoto de Recebimento</b></div>
          <div class="canhoto-text">
            Recebemos de ${escapeHtml(empresaNome)} os produtos constantes na NF-e nº <b>${escapeHtml(String(numeroNota))}</b> série <b>${escapeHtml(String(serieNota))}</b>.
          </div>
          <div class="signature">
            <div>Data de recebimento</div>
            <div>Nome legível</div>
            <div>CPF/Documento</div>
          </div>
        </div>`
            : ""
        }
      </section>`;
      })
      .join("");

    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>DANFE-NFe-${escapeHtml(String(numeroNota))}</title>
    <style>
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 10px; }
      .page { width: 100%; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .box { border: 0.7px solid #000; margin-bottom: 4px; }
      .box-inner-title { font-weight: 700; font-size: 10px; text-transform: uppercase; padding: 4px 6px; border-top: 0.7px solid #000; border-bottom: 0.7px solid #000; background: #f5f5f5; }
      .header-grid { display: grid; grid-template-columns: 40% 24% 36%; gap: 4px; margin-bottom: 4px; }
      .company { display: flex; gap: 8px; padding: 5px; min-height: 118px; }
      .logo { width: 72px; height: 72px; object-fit: contain; border: 0.7px solid #999; padding: 2px; margin-top: 2px; }
      .company-content { flex: 1; min-width: 0; }
      .company-name { font-size: 12px; font-weight: 700; margin-bottom: 2px; line-height: 1.2; }
      .row { line-height: 1.25; margin-bottom: 1px; word-break: break-word; }
      .nfe-box { padding: 5px; min-height: 118px; }
      .danfe-title { font-size: 17px; font-weight: 700; text-align: center; line-height: 1; margin-top: 2px; }
      .sub-title { text-align: center; font-size: 9px; margin-top: 2px; line-height: 1.2; }
      .nfe-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 8px; }
      .nfe-grid > div { border: 0.7px solid #000; padding: 3px; min-height: 28px; }
      .nfe-grid b { display: block; font-size: 8px; text-transform: uppercase; }
      .nfe-grid span { display: block; font-size: 11px; font-weight: 700; margin-top: 2px; }
      .key-box { padding: 5px; min-height: 118px; }
      .key-title { margin-bottom: 2px; }
      .key-value { font-family: monospace; font-size: 10px; letter-spacing: 0.2px; word-break: break-all; }
      .barcode-wrap { border: 0.7px solid #000; margin-top: 4px; padding: 2px 4px; }
      .barcode { width: 100%; height: 40px; object-fit: fill; display: block; }
      .consulta { margin-top: 4px; font-size: 8px; line-height: 1.2; }
      .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; background: #f2f2f2; padding: 3px 6px; border-bottom: 0.7px solid #000; }
      .grid { display: grid; gap: 0; }
      .dest-grid { grid-template-columns: 2fr 1fr 1fr 1fr 1fr; }
      .dest-grid > div, .tax-grid > div, .transport-grid > div { border-right: 0.7px solid #000; border-bottom: 0.7px solid #000; padding: 3px 5px; min-height: 30px; }
      .dest-grid > div:nth-child(5n), .tax-grid > div:nth-child(5n), .transport-grid > div:nth-child(4n) { border-right: 0; }
      .dest-grid > .span3 { grid-column: span 3; }
      .tax-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
      .transport-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .grid b { display: block; font-size: 8px; text-transform: uppercase; }
      .grid span { display: block; margin-top: 2px; font-size: 10px; line-height: 1.2; word-break: break-word; }
      table { width: 100%; border-collapse: collapse; font-size: 9px; table-layout: fixed; }
      th, td { border: 0.7px solid #000; padding: 3px 4px; vertical-align: top; line-height: 1.2; }
      th { background: #f2f2f2; text-align: left; font-weight: 700; text-transform: uppercase; font-size: 8px; }
      .items .wrap { white-space: normal; word-break: break-word; }
      .right { text-align: right; }
      .center { text-align: center; }
      .double-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 4px; }
      .info-list { padding: 4px 6px; border-bottom: 0.7px solid #000; line-height: 1.3; word-break: break-word; }
      .info-list:last-child { border-bottom: 0; }
      .footer-box { padding: 6px; line-height: 1.3; font-size: 9px; }
      .canhoto { border: 0.7px dashed #000; padding: 6px; font-size: 9px; }
      .canhoto-text { margin-top: 4px; line-height: 1.3; }
      .signature { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
      .signature div { border-top: 0.7px solid #000; padding-top: 3px; text-align: center; min-height: 16px; }
    </style>
  </head>
  <body>
    ${pagesHtml}
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

    if (autoPrint) {
      setTimeout(() => {
        win.focus();
        win.print();
        setTimeout(() => {
          if (document.body.contains(frame)) document.body.removeChild(frame);
        }, 500);
      }, 200);
      return;
    }

    setTimeout(() => {
      win.focus();
    }, 200);
  };

  const buildAuthorizedNfeFromVenda = async (venda: any) => {
    const fiscal = await adminApi.getVendaFiscalXml(venda.id);
    if (String(fiscal?.modelo || "") !== "55") {
      throw new Error("Esta venda não possui NF-e (modelo 55) autorizada.");
    }

    const nfe = buildNfeFromFiscalXml(fiscal, venda);
    if (!nfe.authorized) {
      throw new Error(
        `NF-e não autorizada para esta venda. [${nfe.statusCode || "SEM_COD"}] ${nfe.statusMessage || "Sem detalhe."}`,
      );
    }
    return nfe;
  };

  const handlePrintVendaDiretaDanfe = async (venda: any) => {
    if (!venda?.id) return;
    try {
      const nfe = await buildAuthorizedNfeFromVenda(venda);
      openDanfeA4(nfe, venda, { autoPrint: true });
    } catch (err: any) {
      setAlertModal({
        open: true,
        title: "Nota Fiscal",
        message:
          err?.message ||
          "Não foi possível carregar o XML fiscal desta venda para impressão.",
      });
    }
  };

  const handleOpenVendaDiretaDanfePdf = async (venda: any) => {
    if (!venda?.id) return;
    try {
      const nfe = await buildAuthorizedNfeFromVenda(venda);
      openDanfeA4(nfe, venda, { autoPrint: false });
      setAlertModal({
        open: true,
        title: "PDF DANFE",
        message:
          "Pré-visualização A4 aberta. Use Ctrl+P e escolha “Salvar como PDF” para enviar ao cliente.",
      });
    } catch (err: any) {
      setAlertModal({
        open: true,
        title: "Nota Fiscal",
        message:
          err?.message ||
          "Não foi possível abrir a pré-visualização A4 da NF-e.",
      });
    }
  };

  const handleDownloadVendaDiretaXml = async (venda: any) => {
    if (!venda?.id) return;
    try {
      const { blob, filename } = await adminApi.downloadVendaFiscalXml(
        venda.id,
      );
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download =
        filename ||
        `NFe-${venda?.codigo || venda?.id || "venda"}-${venda?.notaFiscalNumero || "sem-numero"}.xml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err: any) {
      setAlertModal({
        open: true,
        title: "XML NF-e",
        message:
          err?.message ||
          "Não foi possível baixar o XML autorizado desta venda.",
      });
    }
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
        openDanfeA4(result.nfe, venda, { autoPrint: true });
      } catch (e) {
        console.error(e);
      }
      setAlertModal({
        open: true,
        title: "Venda Direta",
        message: `${successMessage}\nNF-e autorizada em homologação. DANFE A4 aberto para impressão/salvar em PDF.`,
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
        showFiscalFeedback(
          result,
          "Venda atualizada com sucesso.",
          vendaRetornada,
        );
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
        const vendaRetornada = result?.venda
          ? { ...vendaParaImpressao, ...result.venda }
          : vendaParaImpressao;
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

  const filteredCatalogProdutos = useMemo(() => {
    const term = String(catalogSearch || "")
      .trim()
      .toLowerCase();
    return produtos.filter((p) => {
      const searchOk =
        !term ||
        String(p.codigo_barras || "")
          .toLowerCase()
          .includes(term) ||
        String(p.nome || "")
          .toLowerCase()
          .includes(term) ||
        String(p.codigoCatalogo || "")
          .toLowerCase()
          .includes(term);
      if (!searchOk) return false;
      if (!catalogCategory) return true;
      return (
        String(p.categoria || "")
          .trim()
          .toLowerCase() === catalogCategory.toLowerCase()
      );
    });
  }, [produtos, catalogSearch, catalogCategory]);

  const filteredCatalogIds = useMemo(
    () => filteredCatalogProdutos.map((p) => p.id),
    [filteredCatalogProdutos],
  );

  const allFilteredCatalogSelected =
    filteredCatalogIds.length > 0 &&
    filteredCatalogIds.every((id) => selectedCatalogIds.includes(id));

  const selectedCatalogProdutos = useMemo(
    () => produtos.filter((p) => selectedCatalogIds.includes(p.id)),
    [produtos, selectedCatalogIds],
  );

  const toggleCatalogProductSelection = (produtoId: string) => {
    setSelectedCatalogIds((prev) =>
      prev.includes(produtoId)
        ? prev.filter((id) => id !== produtoId)
        : [...prev, produtoId],
    );
  };

  const toggleSelectAllFilteredCatalog = () => {
    setSelectedCatalogIds((prev) => {
      if (allFilteredCatalogSelected) {
        return prev.filter((id) => !filteredCatalogIds.includes(id));
      }
      return Array.from(new Set([...prev, ...filteredCatalogIds]));
    });
  };

  const handleGenerateCatalogPdf = () => {
    if (selectedCatalogProdutos.length === 0) {
      setAlertModal({
        open: true,
        title: "Catálogo em PDF",
        message:
          "Selecione ao menos um item no catálogo para gerar o PDF do cliente.",
      });
      return;
    }

    const categoryOrder = ["Doces", "Festas", "Embalagens"];
    const groupedByCategory = selectedCatalogProdutos.reduce(
      (acc, p) => {
        const key = String(p.categoria || "")
          .trim()
          .toLowerCase();
        if (!acc[key]) acc[key] = [];
        acc[key].push(p);
        return acc;
      },
      {} as Record<string, Produto[]>,
    );

    const categoriesForPdf = [
      ...categoryOrder.filter(
        (cat) => groupedByCategory[cat.toLowerCase()]?.length > 0,
      ),
      ...Object.keys(groupedByCategory)
        .filter(
          (k) =>
            !categoryOrder.some((cat) => cat.toLowerCase() === k) &&
            groupedByCategory[k]?.length > 0,
        )
        .map((k) => groupedByCategory[k][0]?.categoria || "Sem categoria"),
    ];

    const sectionsHtml = categoriesForPdf
      .map((categoryLabel) => {
        const products = groupedByCategory[String(categoryLabel).toLowerCase()];
        if (!products?.length) return "";

        const rowsHtml = products
          .map((p) => {
            const imagemUrl = adminApi.getCatalogoImageUrl(p.imagemCatalogo);
            const precoVarejo = Number(p.preco_varejo || 0).toLocaleString(
              "pt-BR",
              {
                style: "currency",
                currency: "BRL",
              },
            );
            const precoAtacado = Number(p.preco_atacado || 0).toLocaleString(
              "pt-BR",
              {
                style: "currency",
                currency: "BRL",
              },
            );
            return `<tr>
              <td class="img-col">
                ${
                  imagemUrl
                    ? `<img src="${escapeHtml(imagemUrl)}" alt="${escapeHtml(p.nome || "Produto")}" />`
                    : `<div class="no-img">Sem imagem</div>`
                }
              </td>
              <td class="info-col">
                <div class="label">Código de barras</div>
                <div class="value mono">${escapeHtml(p.codigo_barras || "-")}</div>
                <div class="label">Descrição</div>
                <div class="value">${escapeHtml(p.nome || "-")}</div>
              </td>
              <td class="pricing-col">
                <div class="price-box">
                  <div class="label">Varejo</div>
                  <div class="price">${escapeHtml(precoVarejo)}</div>
                </div>
                <div class="price-box atacado">
                  <div class="label">Atacado</div>
                  <div class="price">${escapeHtml(precoAtacado)}</div>
                  <div class="hint">Mín: ${escapeHtml(String(p.qtd_atacado || 0))}</div>
                </div>
              </td>
            </tr>`;
          })
          .join("");

        return `<section class="category-section">
          <h2>${escapeHtml(categoryLabel || "Sem categoria")}</h2>
          <table>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </section>`;
      })
      .join("");

    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Catálogo de Produtos</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
      h1 { margin: 0; font-size: 20px; letter-spacing: 0.2px; }
      h2 { margin: 0 0 8px; font-size: 14px; color: #334155; text-transform: uppercase; }
      .sub { margin: 4px 0 0; color: #475569; }
      .header { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; margin-bottom: 12px; }
      .company { display: grid; grid-template-columns: 72px 1fr; gap: 10px; align-items: center; }
      .logo { width: 72px; height: 72px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; }
      .company-name { font-weight: 700; font-size: 14px; color: #0f172a; }
      .company-info { margin-top: 2px; color: #334155; font-size: 11px; }
      .title-wrap { text-align: right; }
      .category-section { margin-top: 12px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      td { border: 1px solid #cbd5e1; vertical-align: top; padding: 8px; }
      .img-col { width: 24%; }
      .info-col { width: 46%; }
      .pricing-col { width: 30%; }
      img { width: 100%; height: 110px; object-fit: contain; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
      .no-img { width: 100%; height: 110px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; color: #94a3b8; }
      .label { text-transform: uppercase; font-size: 9px; color: #64748b; font-weight: 700; margin-top: 4px; }
      .value { font-size: 12px; font-weight: 600; margin-top: 2px; }
      .mono { font-family: "Courier New", monospace; font-size: 11px; }
      .price-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; margin-bottom: 8px; }
      .price-box.atacado { background: #eef2ff; border-color: #c7d2fe; }
      .price { font-size: 13px; font-weight: 700; margin-top: 2px; }
      .hint { font-size: 10px; color: #475569; margin-top: 4px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="company">
        <img src="${logoLoja}" alt="Logo Celebrar" class="logo" />
        <div>
          <div class="company-name">CELEBRAR FESTAS E EMBALAGENS LTDA</div>
          <div class="company-info">AVENIDA SENADOR LEVINDO COELHO, 1995 - VALE DO JATOBÁ - BELO HORIZONTE/MG</div>
          <div class="company-info">Telefone/WhatsApp: (31) 97361-4998</div>
        </div>
      </div>
      <div class="title-wrap">
        <h1>CATÁLOGO DE PRODUTOS</h1>
        <p class="sub">Total de itens selecionados: ${selectedCatalogProdutos.length}</p>
      </div>
    </div>
    ${sectionsHtml}
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
      setAlertModal({
        open: true,
        title: "Catálogo em PDF",
        message: "Não foi possível abrir a pré-visualização do catálogo.",
      });
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    setTimeout(() => {
      win.focus();
      win.print();
      setTimeout(() => {
        if (document.body.contains(frame)) document.body.removeChild(frame);
      }, 600);
    }, 250);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-slate-800">Venda Direta</h3>
          <p className="text-xs text-slate-500">
            Crie pedidos rápidos e gerencie status de entrega e pagamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCatalogModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2"
          >
            <Icons.Product /> Catálogo
          </button>
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
                        Entrega: {formatDateOnly(v.data_entrega)}
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
                                  const result =
                                    await adminApi.updateVendaStatus(v.id, {
                                      status: "CONCLUIDO",
                                      contaBancariaId:
                                        v.contaBancariaId || null,
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
                                produtoDetalhes: prod
                                  ? { produto: prod }
                                  : null,
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
                        setDetailsTab("venda");
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
        open={catalogModalOpen}
        title="Catálogo de Produtos"
        onClose={() => setCatalogModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-3">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Busca
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                placeholder="Código de barras, descrição ou código de catálogo..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Categoria
              </label>
              <select
                className="w-full p-2.5 border rounded-lg"
                value={catalogCategory}
                onChange={(e) => setCatalogCategory(e.target.value)}
              >
                <option value="">Todas</option>
                {CATALOGO_CATEGORIAS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1 flex items-end">
              {selectedCatalogIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleGenerateCatalogPdf}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold"
                >
                  Gerar PDF
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {filteredCatalogProdutos.length} produto(s) no catálogo.
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allFilteredCatalogSelected}
                  onChange={toggleSelectAllFilteredCatalog}
                />
                <span>Marcar/Desmarcar todos (filtro atual)</span>
              </label>
              <span>{selectedCatalogIds.length} selecionado(s)</span>
            </div>
          </div>

          <div className="max-h-[65vh] overflow-y-auto space-y-3 pr-1">
            {filteredCatalogProdutos.map((p) => {
              const imagemUrl = adminApi.getCatalogoImageUrl(p.imagemCatalogo);
              return (
                <div
                  key={p.id}
                  className="border border-slate-200 rounded-xl bg-white shadow-sm p-3 overflow-x-auto"
                >
                  <div className="min-w-[780px] grid grid-cols-[170px_1.45fr_1.75fr_170px] gap-3 items-stretch">
                    <div className="h-32 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center p-2">
                      {imagemUrl ? (
                        <img
                          src={imagemUrl}
                          alt={p.nome}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">
                          Sem imagem
                        </span>
                      )}
                    </div>

                    <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                      <div className="text-[10px] uppercase text-slate-500 font-bold">
                        Informações do Produto
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        Código de barras
                      </div>
                      <div className="font-mono text-xs text-slate-700">
                        {p.codigo_barras || "-"}
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        Descrição
                      </div>
                      <div className="font-semibold text-slate-800">
                        {p.nome}
                      </div>
                    </div>

                    <div className="rounded-lg border border-indigo-100 p-3 bg-indigo-50">
                      <div className="text-[10px] uppercase text-indigo-600 font-bold">
                        Preço e Estoque
                      </div>
                      <div className="mt-2 text-[11px] text-indigo-500">
                        Varejo
                      </div>
                      <div className="font-bold text-slate-800">
                        {(p.preco_varejo || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </div>
                      <div className="mt-2 text-[11px] text-indigo-500">
                        Atacado
                      </div>
                      <div className="font-bold text-indigo-700">
                        {(p.preco_atacado || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </div>
                      <div className="text-[11px] text-indigo-600 mt-1">
                        Quantidade mínima: {p.qtd_atacado || 0}
                      </div>
                      <div className="mt-2 text-[11px] text-indigo-500">
                        Quantidade em estoque
                      </div>
                      <div className="font-bold text-slate-800">
                        {Number(p.estoque || 0).toLocaleString("pt-BR")}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-3 bg-white flex flex-col justify-center">
                      <div className="text-[10px] uppercase text-slate-500 font-bold">
                        Ações
                      </div>
                      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCatalogIds.includes(p.id)}
                          onChange={() => toggleCatalogProductSelection(p.id)}
                        />
                        Incluir no PDF
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredCatalogProdutos.length === 0 && (
              <div className="text-center text-slate-400 p-8 border border-dashed rounded-lg">
                Nenhum produto encontrado para os filtros informados.
              </div>
            )}
          </div>
        </div>
      </Modal>

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
                      endereco: {
                        ...form.endereco,
                        complemento: e.target.value,
                      },
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
                            const detalhes = await adminApi.getProdutoDetalhes(
                              p.id,
                            );
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
                  <option value="PEDIDO">Pedido (programação, não pago)</option>
                  <option value="ENVIADO">Enviado (entrega, não pago)</option>
                  <option value="ENTREGA">Entrega (pago, programado)</option>
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
          setDetailsTab("venda");
        }}
      >
        {!selectedVenda ? (
          <div className="p-6 text-center text-slate-400">Carregando...</div>
        ) : (
          <div className="space-y-4">
            <div className="border-b border-slate-200 flex gap-6">
              <button
                onClick={() => setDetailsTab("venda")}
                className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                  detailsTab === "venda"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                Venda
              </button>
              <button
                onClick={() => setDetailsTab("notaFiscal")}
                className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                  detailsTab === "notaFiscal"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                Nota Fiscal
              </button>
            </div>

            {detailsTab === "venda" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-400 uppercase">
                      Código
                    </div>
                    <div className="font-mono font-bold">
                      {selectedVenda.codigo || selectedVenda.id}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 uppercase">
                      Status
                    </div>
                    <div className="font-bold">{selectedVenda.status}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 uppercase">
                      Cliente
                    </div>
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
                            {(
                              Number(it.preco_un_aplicado || 0) *
                              Number(it.qtd || 0)
                            ).toLocaleString("pt-BR", {
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
                        {Number(selectedVenda.frete || 0).toLocaleString(
                          "pt-BR",
                          {
                            style: "currency",
                            currency: "BRL",
                          },
                        )}
                      </span>
                    </div>
                    <div className="text-slate-700 text-lg font-bold">
                      Total:{" "}
                      {Number(selectedVenda.total || 0).toLocaleString(
                        "pt-BR",
                        {
                          style: "currency",
                          currency: "BRL",
                        },
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {detailsTab === "notaFiscal" && (
              <div className="space-y-4 animate-fadeIn">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-400 uppercase">
                      Modelo
                    </div>
                    <div className="font-bold">
                      {selectedVenda.notaFiscalModelo || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 uppercase">
                      Sequencial
                    </div>
                    <div className="font-bold">
                      {selectedVenda.notaFiscalSequencial || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 uppercase">
                      Número / Série
                    </div>
                    <div className="font-bold">
                      {selectedVenda.notaFiscalNumero || "-"} /{" "}
                      {selectedVenda.notaFiscalSerie || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 uppercase">
                      Status Receita
                    </div>
                    <div className="font-bold">
                      [{selectedVenda.notaFiscalStatusCode || "SEM_COD"}]{" "}
                      {selectedVenda.notaFiscalStatusMessage || "Sem detalhe"}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-2">
                  <div>
                    <span className="text-xs text-slate-400 uppercase block">
                      Chave de Acesso
                    </span>
                    <span className="font-mono break-all">
                      {selectedVenda.notaFiscalChaveAcesso || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 uppercase block">
                      Protocolo
                    </span>
                    <span className="font-mono">
                      {selectedVenda.notaFiscalProtocolo || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 uppercase block">
                      Autorização
                    </span>
                    <span>
                      {selectedVenda.notaFiscalDataAutorizacao
                        ? formatDate(selectedVenda.notaFiscalDataAutorizacao)
                        : "-"}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadVendaDiretaXml(selectedVenda)}
                    disabled={
                      String(selectedVenda.notaFiscalModelo || "") !== "55"
                    }
                    className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold"
                  >
                    Baixar XML
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenVendaDiretaDanfePdf(selectedVenda)}
                    disabled={
                      String(selectedVenda.notaFiscalModelo || "") !== "55"
                    }
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold"
                  >
                    Gerar PDF (A4)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintVendaDiretaDanfe(selectedVenda)}
                    disabled={
                      String(selectedVenda.notaFiscalModelo || "") !== "55"
                    }
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold"
                  >
                    Imprimir DANFE
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
