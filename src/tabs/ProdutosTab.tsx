import { FormEvent, useEffect, useMemo, useState } from "react";
import { adminApi } from "../api";
import { Icons } from "../components/Icons";
import { CurrencyInput, Modal } from "../components/Shared";
import logoUrl from "../img/logo.png";
import { Lote, Produto, ProdutoDetalhesResponse, Role } from "../types";
import { formatDate, formatMoney } from "../utils";

const emptyProdutoForm: Partial<Produto> = {
  codigo_barras: "",
  nome: "",
  localizacao: "",
  categoria: "",
  ncm: "00000000",
  cest: "",
  tipo_tributacao: "NORMAL",
  csosn: "101",
  cfop_padrao: "5102",
  cst_pis: "49",
  cst_cofins: "49",
  origem: "0",
  codigoCatalogo: "",
  embalagemTipo: "",
  embalagemUnidade: "",
  embalagemQuantidade: 0,
  precoEmbalagem: 0,
  precoUnidade: 0,
  custo_produto: 0,
  margem_minima: 0,
  preco_varejo: 0,
  preco_atacado: 0,
  qtd_atacado: 0,
  estoque: 0,
  granularAtivo: false,
  granularTipo: "GRAMA",
  granularFatorConversao: 0,
  granularProdutoPaiId: "",
};

const normalizeBarcodeValue = (value: string) =>
  String(value || "")
    .replace(/[\r\n\t]+/g, "")
    .trim()
    .replace(/^#?b(?=\d)/i, "")
    .replace(/#+$/g, "")
    .trim();

const normalizeSearchInputValue = (value: string) => {
  const raw = String(value || "").replace(/[\u0000-\u001F\u007F]+/g, "");
  const trimmed = raw.trim();
  if (/^#?b\d+#+$/i.test(trimmed)) {
    return normalizeBarcodeValue(trimmed);
  }
  return raw;
};

const normalizeGranularTipo = (value?: string | null) => {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw) return "";
  if (
    raw === "GRAMA" ||
    raw === "GRAMAS" ||
    raw === "KG" ||
    raw === "KILO" ||
    raw === "KILOS" ||
    raw === "QUILO" ||
    raw === "QUILOS"
  ) {
    return "GRAMA";
  }
  if (raw === "UNIDADE" || raw === "UNIDADES" || raw === "UN") {
    return "UNIDADE";
  }
  return raw;
};

const isGranularProduct = (p?: Partial<Produto> | null) =>
  Boolean(
    p?.granularAtivo &&
      p?.granularProdutoPaiId &&
      normalizeGranularTipo(p?.granularTipo) &&
      Number(p?.granularFatorConversao || 0) > 0,
  );

const formatQty = (value: number, decimals = 3) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  const fixed = num.toFixed(decimals);
  return fixed.replace(/\.?0+$/, "");
};

const getGranularUnitLabel = (p?: Partial<Produto> | null) =>
  normalizeGranularTipo(p?.granularTipo) === "GRAMA" ? "g" : "un";

// Componente Badge de Markup
const MarkupBadge = ({ custo, preco }: { custo: number; preco: number }) => {
  if (custo <= 0)
    return (
      <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded">
        Sem Custo
      </span>
    );
  const markup = ((preco - custo) / custo) * 100;

  let colorClass = "bg-yellow-100 text-yellow-700"; // Médio
  if (markup < 25) colorClass = "bg-red-100 text-red-700"; // Baixo / Perigo
  if (markup > 45) colorClass = "bg-emerald-100 text-emerald-700"; // Alto / Saudável

  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ml-2 ${colorClass}`}
    >
      {markup.toFixed(0)}%
    </span>
  );
};

export function ProdutosTab() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [userRole, setUserRole] = useState<Role>("OPERADOR");
  const isAdmin = userRole === "ADMIN";
  const [reorderOpen, setReorderOpen] = useState(false);
  const [labelModalOpen, setLabelModalOpen] = useState(false);

  // Filters State
  const [searchText, setSearchText] = useState("");
  const [retailMarginFilter, setRetailMarginFilter] = useState("");
  const [wholesaleMarginFilter, setWholesaleMarginFilter] = useState("");
  const [coverageFilter, setCoverageFilter] = useState("");
  const [labelSearch, setLabelSearch] = useState("");
  const [labelSelection, setLabelSelection] = useState<Record<string, boolean>>(
    {},
  );

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adminActionModal, setAdminActionModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  // Data State
  const [form, setForm] = useState(emptyProdutoForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] =
    useState<ProdutoDetalhesResponse | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<
    "geral" | "lotes" | "compras" | "movimentacao"
  >("geral");

  // Ajuste de Estoque State
  const [adjustLotes, setAdjustLotes] = useState<Lote[]>([]);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustingProduct, setAdjustingProduct] = useState<Produto | null>(
    null,
  );
  const [replenishModalOpen, setReplenishModalOpen] = useState(false);
  const [replenishProduct, setReplenishProduct] = useState<Produto | null>(
    null,
  );
  const [replenishQty, setReplenishQty] = useState<number>(0);
  const [replenishReason, setReplenishReason] = useState("");
  const [granularParentQuery, setGranularParentQuery] = useState("");
  const [granularParentSuggestionsOpen, setGranularParentSuggestionsOpen] =
    useState(false);

  const loadData = async () => {
    try {
      const user = adminApi.getStoredUser();
      if (user) setUserRole(user.role);

      const p = await adminApi.getProdutos();
      setProdutos(p);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --- FILTERING LOGIC ---
  const filteredProdutos = useMemo(() => {
    return produtos.filter((p) => {
      // 1. Text Search
      const search = searchText.toLowerCase();
      const barcodeSearch = normalizeBarcodeValue(searchText).toLowerCase();
      const codigoBarras = (p.codigo_barras || "").toLowerCase();
      const codigoBarrasDigits = codigoBarras.replace(/\D/g, "");
      const barcodeSearchDigits = barcodeSearch.replace(/\D/g, "");
      const codigoFornecedor = (p.codigoCatalogo || "").toLowerCase();
      const matchesText =
        p.nome.toLowerCase().includes(search) ||
        codigoBarras.includes(search) ||
        (barcodeSearch && codigoBarras.includes(barcodeSearch)) ||
        (barcodeSearchDigits &&
          codigoBarrasDigits.includes(barcodeSearchDigits)) ||
        codigoFornecedor.includes(search) ||
        (p.categoria || "").toLowerCase().includes(search) ||
        (p.localizacao || "").toLowerCase().includes(search);

      if (!matchesText) return false;

      // Helper for markup
      const getMarkup = (price: number) =>
        p.custo_produto > 0
          ? ((price - p.custo_produto) / p.custo_produto) * 100
          : 0;

      // 2. Retail Margin
      if (retailMarginFilter) {
        const m = getMarkup(p.preco_varejo);
        if (retailMarginFilter === "<10" && m >= 10) return false;
        if (retailMarginFilter === "10-20" && (m < 10 || m >= 20)) return false;
        if (retailMarginFilter === "20-30" && (m < 20 || m >= 30)) return false;
        if (retailMarginFilter === "30-40" && (m < 30 || m >= 40)) return false;
        if (retailMarginFilter === "40-50" && (m < 40 || m >= 50)) return false;
        if (retailMarginFilter === "50-80" && (m < 50 || m >= 80)) return false;
        if (retailMarginFilter === ">80" && m < 80) return false;
      }

      // 3. Wholesale Margin
      if (wholesaleMarginFilter) {
        const m = getMarkup(p.preco_atacado);
        if (wholesaleMarginFilter === "<10" && m >= 10) return false;
        if (wholesaleMarginFilter === "10-20" && (m < 10 || m >= 20))
          return false;
        if (wholesaleMarginFilter === "20-30" && (m < 20 || m >= 30))
          return false;
        if (wholesaleMarginFilter === "30-40" && (m < 30 || m >= 40))
          return false;
        if (wholesaleMarginFilter === "40-50" && (m < 40 || m >= 50))
          return false;
        if (wholesaleMarginFilter === "50-80" && (m < 50 || m >= 80))
          return false;
        if (wholesaleMarginFilter === ">80" && m < 80) return false;
      }

      // 4. Stock Coverage (Days)
      // Giro Mensal / 30 = Giro Diario. Estoque / Giro Diario = Dias.
      const dailySales = p.giroDiario ?? (p.giroMensal || 0) / 30;
      const days = dailySales > 0 ? p.estoque / dailySales : 9999; // 9999 means infinite/no sales

      if (coverageFilter) {
        if (coverageFilter === "<10" && days >= 10) return false;
        if (coverageFilter === "10-20" && (days < 10 || days >= 20))
          return false;
        if (coverageFilter === "20-40" && (days < 20 || days >= 40))
          return false;
        if (coverageFilter === ">40" && days < 40) return false;
      }

      return true;
    });
  }, [
    produtos,
    searchText,
    retailMarginFilter,
    wholesaleMarginFilter,
    coverageFilter,
  ]);

  const filteredLabelProdutos = useMemo(() => {
    const term = labelSearch.trim().toLowerCase();
    if (!term) return produtos;
    return produtos.filter((p) => {
      const nome = (p.nome || "").toLowerCase();
      const codigo = (p.codigo_barras || "").toLowerCase();
      const localizacao = (p.localizacao || "").toLowerCase();
      return (
        nome.includes(term) || codigo.includes(term) || localizacao.includes(term)
      );
    });
  }, [produtos, labelSearch]);

  const granularParentOptions = useMemo(() => {
    return produtos
      .filter((p) => p.id !== editingId)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [produtos, editingId]);

  const selectedGranularParent = useMemo(
    () =>
      granularParentOptions.find((p) => p.id === form.granularProdutoPaiId) ||
      null,
    [granularParentOptions, form.granularProdutoPaiId],
  );

  const filteredGranularParentOptions = useMemo(() => {
    const raw = granularParentQuery.trim().toLowerCase();
    const barcodeQuery = normalizeBarcodeValue(granularParentQuery).toLowerCase();
    const barcodeDigits = barcodeQuery.replace(/\D/g, "");

    const base = granularParentOptions.filter((p) => {
      if (!raw && !barcodeQuery) return true;

      const nome = (p.nome || "").toLowerCase();
      const codigo = (p.codigo_barras || "").toLowerCase();
      const localizacao = (p.localizacao || "").toLowerCase();
      const codigoDigits = codigo.replace(/\D/g, "");

      return (
        nome.includes(raw) ||
        localizacao.includes(raw) ||
        codigo.includes(raw) ||
        (barcodeQuery && codigo.includes(barcodeQuery)) ||
        (barcodeDigits && codigoDigits.includes(barcodeDigits))
      );
    });

    return base.slice(0, 40);
  }, [granularParentOptions, granularParentQuery]);

  const selectedLabelIds = useMemo(
    () => Object.keys(labelSelection).filter((id) => labelSelection[id]),
    [labelSelection],
  );
  const hasSelectedLabels = selectedLabelIds.length > 0;

  const allLabelsSelected =
    filteredLabelProdutos.length > 0 &&
    filteredLabelProdutos.every((p) => labelSelection[p.id]);
  const noneLabelsSelected = selectedLabelIds.length === 0;

  const toggleLabelSelection = (id: string) => {
    setLabelSelection((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllLabels = () => {
    const next: Record<string, boolean> = {};
    filteredLabelProdutos.forEach((p) => {
      next[p.id] = true;
    });
    setLabelSelection(next);
  };

  const clearAllLabels = () => {
    setLabelSelection({});
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const renderCodeLocationHtml = (code: string, location: string) => {
    const clean = code.replace(/\s+/g, "");
    const loc = (location || "").trim();
    return `
      <div class="label-top">
        <div class="label-code">${escapeHtml(clean || "-")}</div>
        <div class="label-location">${escapeHtml(loc || "-")}</div>
      </div>
    `;
  };

  const handleGenerateLabels = () => {
    const selected = produtos.filter((p) => labelSelection[p.id]);
    if (selected.length === 0) return;

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Etiquetas</title>
          <style>
            @page { size: A4; margin: 1cm; }
            body { margin: 0; font-family: Arial, sans-serif; color: #111; }
            .sheet {
              width: 19cm;
              min-height: 27.7cm;
              display: grid;
              grid-template-columns: repeat(2, 8cm);
              grid-auto-rows: 4cm;
              gap: 0.4cm;
              align-content: start;
            }
            .label {
              width: 8cm;
              height: 4cm;
              border: 1px solid black;
              box-sizing: border-box;
              display: grid;
              grid-template-rows: 0.8cm 1.3cm 1fr;
              row-gap: 0.1cm;
              position: relative;
              overflow: hidden;
            }
            .label-top {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 0.1cm 0.2cm 0 0.2cm;
              z-index: 2;
            }
            .label-code {
              font-size: 14px;
              font-weight: 800;
              letter-spacing: 0.02em;
              color: #111;
            }
            .label-location {
              font-size: 13px;
              font-weight: 700;
              color: #2a2a2a;
              text-align: right;
            }
            .label-watermark {
              position: absolute;
              inset: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              opacity: 0.32;
              z-index: 1;
              pointer-events: none;
            }
            .label-watermark img {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            .label-desc {
              font-size: 20px;
              font-weight: 700;
              color: #1f1f1f;
              line-height: 1.15;
              align-content: center;
              text-align: center;
              padding: 0 0.2cm;
              z-index: 2;
            }
            .prices {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 0.2cm;
              align-items: start;
              padding: 0 0.2cm 0.1cm 0.2cm;
              z-index: 2;
            }
            .price-block {
              padding: 0.05cm 0.1cm;
              text-align: center;
            }
            .price-title { font-size: 11px; text-transform: uppercase; color: #4a4a4a; letter-spacing: 0.02em; }
            .price-value { font-size: 32px; font-weight: 800; margin-top: 2px; color: #111; }
            .price-sub { font-size: 11px; color: #6a6a6a; margin-top: 2px; }
            .price-block.atacado .price-title { color: #6a6a6a; }
            .price-block.atacado .price-value { color: #333; font-size: 18px; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="sheet">
            ${selected
              .map((p) => {
                const descricao = p.nome || "";
                const precoVarejo = formatMoney(p.preco_varejo || 0);
                const precoAtacado = formatMoney(p.preco_atacado || 0);
                const qtdAtacado = p.qtd_atacado || 0;
                return `
                  <div class="label">
                    <div class="label-watermark">
                      <img src="${logoUrl}" alt="Logo" />
                    </div>
                    ${renderCodeLocationHtml(
                      p.codigo_barras || "",
                      p.localizacao || "",
                    )}
                    <div class="label-desc">${escapeHtml(descricao)}</div>
                    <div class="prices">
                      <div class="price-block">
                        <div class="price-title">Varejo</div>
                        <div class="price-value">${escapeHtml(
                          precoVarejo,
                        )}</div>
                      </div>
                      <div class="price-block atacado">
                        <div class="price-title">Atacado</div>
                        <div class="price-value">${escapeHtml(
                          precoAtacado,
                        )}</div>
                        <div class="price-sub">Mín: ${qtdAtacado} un</div>
                      </div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `;

    const win = window.open("", "_blank");
    if (!win) {
      alert("Pop-up bloqueado. Permita pop-ups para gerar as etiquetas.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const granularEnabled = Boolean(form.granularAtivo);
      if (granularEnabled) {
        const fator = Number(form.granularFatorConversao || 0);
        const principal = String(form.granularProdutoPaiId || "").trim();
        const tipo = normalizeGranularTipo(form.granularTipo);
        if (!principal) {
          alert("Selecione o produto principal para o vínculo granular.");
          return;
        }
        if (!tipo || (tipo !== "GRAMA" && tipo !== "UNIDADE")) {
          alert("Selecione o tipo granular (grama ou unidade).");
          return;
        }
        if (!Number.isFinite(fator) || fator <= 0) {
          alert(
            "Informe a quantidade granular gerada por 1 unidade do produto principal.",
          );
          return;
        }
      }

      const payload = {
        ...form,
        codigo_barras: normalizeBarcodeValue(form.codigo_barras || ""),
        granularAtivo: granularEnabled,
        granularTipo: granularEnabled
          ? normalizeGranularTipo(form.granularTipo) || null
          : null,
        granularFatorConversao: granularEnabled
          ? Number(form.granularFatorConversao || 0)
          : null,
        granularProdutoPaiId: granularEnabled
          ? String(form.granularProdutoPaiId || "").trim() || null
          : null,
      };
      if (editingId) await adminApi.updateProduto(editingId, payload);
      else await adminApi.createProduto(payload);
      setModalOpen(false);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const applyTributacaoRules = (
    next: Partial<Produto>,
    source: "cest" | "tipo" | "manual" = "manual",
  ) => {
    const hasCest = Boolean(String(next.cest || "").trim());
    const tipo = hasCest ? "ST" : "NORMAL";
    const updated: Partial<Produto> = {
      ...next,
      tipo_tributacao: source === "tipo" ? next.tipo_tributacao || tipo : tipo,
      ncm: String(next.ncm || "00000000")
        .replace(/\D/g, "")
        .slice(0, 8),
      cest: String(next.cest || "")
        .replace(/\D/g, "")
        .slice(0, 7),
      origem:
        String(next.origem || "0")
          .replace(/\D/g, "")
          .slice(0, 1) || "0",
      cst_pis:
        String(next.cst_pis || "49")
          .replace(/\D/g, "")
          .slice(0, 2) || "49",
      cst_cofins:
        String(next.cst_cofins || "49")
          .replace(/\D/g, "")
          .slice(0, 2) || "49",
    };

    if ((updated.tipo_tributacao || "NORMAL") === "NORMAL") {
      updated.csosn = "101";
      updated.cfop_padrao = "5102";
    } else {
      updated.csosn =
        String(next.csosn || "")
          .replace(/\D/g, "")
          .slice(0, 3) || "500";
      updated.cfop_padrao =
        String(next.cfop_padrao || "")
          .replace(/\D/g, "")
          .slice(0, 4) || "5405";
    }

    return updated;
  };

  const openModal = (p?: Produto) => {
    setEditingId(p ? p.id : null);
    setForm(
      applyTributacaoRules(
        p
          ? {
              ...p,
              codigo_barras: normalizeBarcodeValue(p.codigo_barras || ""),
              categoria: p.categoria || "",
              codigoCatalogo: p.codigoCatalogo || "",
              embalagemTipo: p.embalagemTipo || "",
              embalagemUnidade: p.embalagemUnidade || "",
              embalagemQuantidade: p.embalagemQuantidade || 0,
              precoEmbalagem: p.precoEmbalagem || 0,
              precoUnidade: p.precoUnidade || 0,
              granularAtivo: Boolean(p.granularAtivo),
              granularTipo: normalizeGranularTipo(p.granularTipo) || "GRAMA",
              granularFatorConversao: p.granularFatorConversao || 0,
              granularProdutoPaiId: p.granularProdutoPaiId || "",
              ncm: p.ncm || "00000000",
              cest: p.cest || "",
              tipo_tributacao: p.tipo_tributacao || "NORMAL",
              csosn: p.csosn || "101",
              cfop_padrao: p.cfop_padrao || "5102",
              cst_pis: p.cst_pis || "49",
              cst_cofins: p.cst_cofins || "49",
              origem: p.origem || "0",
            }
          : emptyProdutoForm,
      ),
    );
    const parent =
      p?.granularProdutoPaiId &&
      produtos.find((item) => item.id === p.granularProdutoPaiId);
    setGranularParentQuery(parent?.codigo_barras || "");
    setGranularParentSuggestionsOpen(false);
    setModalOpen(true);
  };

  const openDetails = async (id: string) => {
    setSelectedDetails(null);
    setDetailsModalOpen(true);
    setActiveDetailTab("geral");
    try {
      const details = await adminApi.getProdutoDetalhes(id);
      setSelectedDetails(details);
    } catch (e) {
      console.error(e);
      setDetailsModalOpen(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir produto?")) return;
    try {
      await adminApi.deleteProduto(id);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const openAdjustModal = async () => {
    if (!editingId) return;
    setModalOpen(false); // Fecha modal de edição
    setAdjustingProduct(produtos.find((p) => p.id === editingId) || null);
    setAdjustReason("");
    setAdjustLotes([]);
    setAdjustModalOpen(true);

    try {
      // Busca lotes atuais
      const details = await adminApi.getProdutoDetalhes(editingId);
      setAdjustLotes(details.lotes);
    } catch (e) {
      alert("Erro ao carregar lotes.");
      setAdjustModalOpen(false);
    }
  };

  const handleAdjustLoteChange = (loteId: string, novaQtd: number) => {
    setAdjustLotes((prev) =>
      prev.map((l) =>
        l.id === loteId ? { ...l, qtdAtual: Math.max(0, novaQtd) } : l,
      ),
    );
  };

  const handleConfirmAdjust = async (e: FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;
    if (!adjustReason.trim()) return alert("A justificativa é obrigatória.");

    try {
      const ajustes = adjustLotes.map((l) => ({
        loteId: l.id,
        novaQtd: l.qtdAtual,
      }));
      await adminApi.ajustarEstoque(adjustingProduct.id, adjustReason, ajustes);
      setAdjustModalOpen(false);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const openReplenishModal = (produto: Produto) => {
    if (!isGranularProduct(produto)) {
      alert("Este produto não possui vínculo granular configurado.");
      return;
    }
    setReplenishProduct(produto);
    setReplenishQty(0);
    setReplenishReason("");
    setReplenishModalOpen(true);
  };

  const replenishConsumption = useMemo(() => {
    if (!replenishProduct) return 0;
    const fator = Number(replenishProduct.granularFatorConversao || 0);
    if (!Number.isFinite(fator) || fator <= 0) return 0;
    const qtd = Number(replenishQty || 0);
    if (!Number.isFinite(qtd) || qtd <= 0) return 0;
    return qtd / fator;
  }, [replenishProduct, replenishQty]);

  const handleConfirmReplenish = async (e: FormEvent) => {
    e.preventDefault();
    if (!replenishProduct) return;

    const qtd = Number(replenishQty || 0);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      alert("Informe uma quantidade maior que zero.");
      return;
    }

    try {
      await adminApi.reporEstoqueGranular(replenishProduct.id, {
        quantidadeGranular: qtd,
        motivo: replenishReason.trim() || undefined,
      });
      setReplenishModalOpen(false);
      setReplenishProduct(null);
      setReplenishQty(0);
      setReplenishReason("");
      await loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const getCoverageLabel = (p: Produto) => {
    const daily = p.giroDiario ?? (p.giroMensal || 0) / 30;
    if (daily <= 0)
      return <span className="text-[10px] text-slate-400">Sem Giro</span>;
    const days = Math.floor(p.estoque / daily);

    let colorClass = "bg-emerald-100 text-emerald-700";
    if (days < 10) colorClass = "bg-rose-100 text-rose-700 animate-pulse";
    else if (days < 20) colorClass = "bg-orange-100 text-orange-700";

    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${colorClass}`}
      >
        {days} dias
      </span>
    );
  };

  const needsReorder = (p: Produto) => {
    const daily = p.giroDiario ?? (p.giroMensal || 0) / 30;
    if (daily <= 0) return false;
    const days = Math.floor(p.estoque / daily);
    const prazo = parseInt(p.fornecedor?.prazoEntrega || "", 10);
    if (!Number.isFinite(prazo)) return false;
    return days <= prazo;
  };

  const produtosRepor = useMemo(
    () => produtos.filter((p) => needsReorder(p)),
    [produtos],
  );

  // --- ADMIN ACTIONS (GOD MODE) ---
  const handleAdminDeleteLote = (id: string) => {
    setAdminActionModal({
      open: true,
      title: "ATENÇÃO: Exclusão de Lote",
      message:
        "Isso apagará o lote permanentemente. Se houver vendas vinculadas, o histórico pode ficar inconsistente. Use apenas para corrigir erros de entrada.",
      onConfirm: async () => {
        try {
          await adminApi.adminDeleteLote(id);
          if (selectedDetails) openDetails(selectedDetails.produto.id);
        } catch (e: any) {
          alert(e.message);
        }
      },
    });
  };

  const handleAdminDeleteItemCompra = (id: string) => {
    setAdminActionModal({
      open: true,
      title: "ATENÇÃO: Exclusão de Histórico de Compra",
      message:
        "Isso remove o registro de entrada. O estoque e o custo médio NÃO serão revertidos automaticamente por esta ação. Use apenas para limpeza de logs.",
      onConfirm: async () => {
        try {
          await adminApi.adminDeleteItemCompra(id);
          if (selectedDetails) openDetails(selectedDetails.produto.id);
        } catch (e: any) {
          alert(e.message);
        }
      },
    });
  };

  const handleAdminDeleteMovimentacao = (id: string) => {
    setAdminActionModal({
      open: true,
      title: "Limpeza de Log",
      message:
        "Apagar este registro de movimentação não altera o estoque atual, apenas remove o histórico visual.",
      onConfirm: async () => {
        try {
          await adminApi.adminDeleteMovimentacao(id);
          if (selectedDetails) openDetails(selectedDetails.produto.id);
        } catch (e: any) {
          alert(e.message);
        }
      },
    });
  };

  const handleEditCost = () => {
    if (!selectedDetails) return;
    // Reuses the main modal but focused on editing cost
    openModal(selectedDetails.produto);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* HEADER PERSONALIZADO */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <h3 className="text-xl font-bold text-slate-800">
          Catálogo & Inteligência de Estoque
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setReorderOpen(true)}
            className="bg-amber-50 hover:bg-amber-100 text-amber-700 px-4 py-2.5 rounded-lg font-bold flex gap-2 border border-amber-200 shadow-sm active:scale-95 transition-all"
          >
            <Icons.ShoppingBag /> Necessidade de Compra
          </button>
          <button
            onClick={() => setLabelModalOpen(true)}
            className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg font-bold flex gap-2 shadow-sm active:scale-95 transition-all"
          >
            <Icons.Product /> Etiquetas
          </button>
          <button
            onClick={() => openModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold flex gap-2 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
          >
            <Icons.Plus /> Incluir Produto
          </button>
        </div>
      </div>

      <div className="p-8 space-y-4 max-w-screen-2xl mx-auto w-full animate-fadeIn">
        {/* FILTROS AVANÇADOS */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* ... Filters unchanged ... */}
          <div className="md:col-span-4 relative">
            <div className="absolute left-3 top-2.5 text-slate-400">
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
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Filtrar por descricao, cod. barras, cod. fornecedor, categoria ou local..."
              value={searchText}
              onChange={(e) =>
                setSearchText(normalizeSearchInputValue(e.target.value))
              }
            />
          </div>
          {/* ... Other filters ... */}
          <div className="md:col-span-2">
            <select
              className="w-full p-2 text-sm border rounded-lg bg-white"
              value={retailMarginFilter}
              onChange={(e) => setRetailMarginFilter(e.target.value)}
            >
              <option value="">Margem Varejo</option>
              <option value="<10">Abaixo de 10%</option>
              <option value="10-20">10% a 20%</option>
              <option value="20-30">20% a 30%</option>
              <option value="30-40">30% a 40%</option>
              <option value="40-50">40% a 50%</option>
              <option value="50-80">50% a 80%</option>
              <option value=">80">Acima de 80%</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <select
              className="w-full p-2 text-sm border rounded-lg bg-white"
              value={wholesaleMarginFilter}
              onChange={(e) => setWholesaleMarginFilter(e.target.value)}
            >
              <option value="">Margem Atacado</option>
              <option value="<10">Abaixo de 10%</option>
              <option value="10-20">10% a 20%</option>
              <option value="20-30">20% a 30%</option>
              <option value="30-40">30% a 40%</option>
              <option value="40-50">40% a 50%</option>
              <option value="50-80">50% a 80%</option>
              <option value=">80">Acima de 80%</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <select
              className="w-full p-2 text-sm border rounded-lg bg-white"
              value={coverageFilter}
              onChange={(e) => setCoverageFilter(e.target.value)}
            >
              <option value="">Nível (Cobertura)</option>
              <option value="<10">Crítico (Menor 10 dias)</option>
              <option value="10-20">Baixo (10-20 dias)</option>
              <option value="20-40">Normal (20-40 dias)</option>
              <option value=">40">Alto (Maior 40 dias)</option>
            </select>
          </div>
          <div className="md:col-span-2 text-right">
            <span className="text-xs text-slate-500 font-bold">
              {filteredProdutos.length} produtos listados
            </span>
          </div>
        </div>

        {/* LISTAGEM DE PRODUTOS */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Produto
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Local e Nível
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Varejo (Markup)
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Atacado
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Estoque & Giro
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredProdutos.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 text-base">
                      {p.nome}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1 rounded border border-slate-200">
                        {p.codigo_barras}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {p.categoria || "-"}
                      </span>
                      {isGranularProduct(p) && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                          Granular {getGranularUnitLabel(p)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="text-xs text-slate-600 flex items-center gap-1">
                        <svg
                          className="w-3 h-3 text-slate-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        {p.localizacao || "N/D"}
                      </div>
                      <div>{getCoverageLabel(p)}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <span className="font-bold text-slate-700 text-base">
                        {formatMoney(p.preco_varejo)}
                      </span>
                      <MarkupBadge
                        custo={p.custo_produto}
                        preco={p.preco_varejo}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Custo: {formatMoney(p.custo_produto)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-indigo-600">
                      {formatMoney(p.preco_atacado)}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-slate-500 bg-indigo-50 px-1 rounded border border-indigo-100">
                        Mín: {p.qtd_atacado} un
                      </span>
                      <MarkupBadge
                        custo={p.custo_produto}
                        preco={p.preco_atacado}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="font-bold text-slate-800">
                        {formatQty(p.estoque)}{" "}
                        {isGranularProduct(p) ? getGranularUnitLabel(p) : "un"}
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex items-center gap-1 border border-slate-200">
                          📦 {p.lotesCount || 0} Lotes
                        </span>
                        <span
                          className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded flex items-center gap-1 border border-blue-100"
                          title="Vendas nos últimos 30 dias"
                        >
                          🔄 Giro: {p.giroMensal || 0}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openDetails(p.id)}
                        className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded transition-colors"
                        title="Detalhes & BI"
                      >
                        <svg
                          className="w-5 h-5"
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
                      {isGranularProduct(p) && (
                        <button
                          onClick={() => openReplenishModal(p)}
                          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 p-2 rounded transition-colors"
                          title="Repor estoque granular (baixa do principal)"
                        >
                          <Icons.ShoppingBag />
                        </button>
                      )}
                      <button
                        onClick={() => openModal(p)}
                        className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded transition-colors"
                        title="Editar Cadastro"
                      >
                        <Icons.Edit />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 p-2 rounded transition-colors"
                        title="Excluir"
                      >
                        <Icons.Trash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MODAL DETALHES (BI) */}
        <Modal
          open={detailsModalOpen}
          title="Raio-X do Produto"
          onClose={() => setDetailsModalOpen(false)}
        >
          {!selectedDetails ? (
            <div className="p-10 text-center text-slate-400 animate-pulse">
              Carregando dados de inteligência...
            </div>
          ) : (
            <div className="space-y-6">
              {/* CABEÇALHO */}
              <div className="flex gap-4 items-start bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="w-16 h-16 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-2xl">
                  📦
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-slate-800">
                    {selectedDetails.produto.nome}
                  </h2>
                  <div className="flex gap-3 text-xs text-slate-500 mt-1">
                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                      {selectedDetails.produto.codigo_barras}
                    </span>
                    <span>
                      Fornecedor:{" "}
                      <strong>
                        {selectedDetails.produto.fornecedor?.nome || "N/A"}
                      </strong>
                    </span>
                    <span>
                      Local:{" "}
                      <strong>
                        {selectedDetails.produto.localizacao || "Geral"}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* KPI CARDS - COM EDIÇÃO PARA ADMIN */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm relative group">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Custo Médio vs Último
                  </div>
                  <div className="flex items-end gap-2 mt-1">
                    <span className="text-xl font-bold text-slate-700">
                      {formatMoney(selectedDetails.produto.custo_produto)}
                    </span>
                    <span className="text-xs text-slate-400 mb-1">
                      Últ: {formatMoney(selectedDetails.kpis.ultimoCusto)}
                    </span>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={handleEditCost}
                      className="absolute top-2 right-2 text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all"
                      title="Editar Custo Manualmente"
                    >
                      <Icons.Edit />
                    </button>
                  )}
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm relative group">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Giro (30 Dias)
                  </div>
                  <div className="flex items-end gap-2 mt-1">
                    <span className="text-xl font-bold text-blue-600">
                      {selectedDetails.kpis.vendas30Dias} un
                    </span>
                    <span className="text-xs text-slate-400 mb-1">
                      vendidas
                    </span>
                  </div>
                  {isAdmin && (
                    <div
                      className="absolute top-2 right-2 text-[10px] text-slate-300 cursor-help"
                      title="Calculado automaticamente com base nas vendas. Para alterar, ajuste o histórico de vendas."
                    >
                      ℹ️ Auto
                    </div>
                  )}
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Cobertura de Estoque
                  </div>
                  <div className="flex items-end gap-2 mt-1">
                    <span
                      className={`text-xl font-bold ${selectedDetails.kpis.coberturaEstoqueDias < 15 ? "text-rose-500" : "text-emerald-600"}`}
                    >
                      {selectedDetails.kpis.coberturaEstoqueDias > 365
                        ? "> 1 ano"
                        : `${selectedDetails.kpis.coberturaEstoqueDias} dias`}
                    </span>
                  </div>
                </div>
              </div>

              {/* TABS COM AÇÕES DE ADMIN */}
              <div>
                <div className="flex border-b border-slate-200 mb-4">
                  <button
                    onClick={() => setActiveDetailTab("geral")}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeDetailTab === "geral" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                  >
                    Lotes Ativos (FIFO)
                  </button>
                  <button
                    onClick={() => setActiveDetailTab("compras")}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeDetailTab === "compras" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                  >
                    Histórico Compras
                  </button>
                  <button
                    onClick={() => setActiveDetailTab("movimentacao")}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeDetailTab === "movimentacao" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                  >
                    Movimentação
                  </button>
                </div>
                <div className="h-64 overflow-y-auto pr-2">
                  {/* LOTES */}
                  {activeDetailTab === "geral" && (
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0">
                        <tr>
                          <th className="p-2">Lote</th>
                          <th className="p-2">Validade</th>
                          <th className="p-2">Qtd Inicial</th>
                          <th className="p-2">Qtd Atual</th>
                          <th className="p-2">Status</th>
                          {isAdmin && (
                            <th className="p-2 text-center">Ações</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDetails.lotes.map((l) => {
                          const daysToExpiry = l.dataValidade
                            ? Math.ceil(
                                (new Date(l.dataValidade).getTime() -
                                  new Date().getTime()) /
                                  (1000 * 60 * 60 * 24),
                              )
                            : 999;
                          return (
                            <tr
                              key={l.id}
                              className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                            >
                              <td className="p-2 font-mono text-slate-600">
                                {l.numeroLote}
                              </td>
                              <td className="p-2">
                                {l.dataValidade ? (
                                  <span
                                    className={`font-bold ${daysToExpiry < 30 ? "text-rose-600" : "text-slate-600"}`}
                                  >
                                    {formatDate(l.dataValidade).split(" ")[0]}
                                    {daysToExpiry < 30 && (
                                      <span className="text-[10px] ml-1 bg-rose-100 px-1 rounded">
                                        Vence em {daysToExpiry}d
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="p-2 text-slate-400">
                                {l.qtdInicial}
                              </td>
                              <td className="p-2 font-bold text-slate-800">
                                {l.qtdAtual}
                              </td>
                              <td className="p-2">
                                <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100">
                                  {l.status}
                                </span>
                              </td>
                              {isAdmin && (
                                <td className="p-2 flex justify-center gap-2">
                                  {/* Para edição de lote, reusamos o modal de ajuste mas de forma individual se necessário, por enquanto apenas DELETE conforme solicitado para limpeza */}
                                  <button
                                    onClick={() => handleAdminDeleteLote(l.id)}
                                    className="text-rose-400 hover:text-rose-600 p-1"
                                    title="Excluir Lote (Admin)"
                                  >
                                    <Icons.Trash />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {/* COMPRAS */}
                  {activeDetailTab === "compras" && (
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0">
                        <tr>
                          <th className="p-2">Data</th>
                          <th className="p-2">Fornecedor</th>
                          <th className="p-2">Qtd</th>
                          <th className="p-2">Custo Un</th>
                          {isAdmin && (
                            <th className="p-2 text-center">Ações</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDetails.historicoCompras.map((c) => (
                          <tr
                            key={c.id}
                            className="border-b border-slate-50 hover:bg-slate-50"
                          >
                            <td className="p-2 text-slate-500">
                              {formatDate(c.data).split(" ")[0]}
                            </td>
                            <td className="p-2 font-medium text-slate-700">
                              {c.fornecedor}
                            </td>
                            <td className="p-2">{c.qtd}</td>
                            <td className="p-2 font-mono text-slate-600">
                              {formatMoney(c.custo_un)}
                            </td>
                            {isAdmin && (
                              <td className="p-2 flex justify-center gap-2">
                                {/* c.itemId vem do novo mapeamento no backend */}
                                <button
                                  onClick={() =>
                                    handleAdminDeleteItemCompra(
                                      (c as any).itemId,
                                    )
                                  }
                                  className="text-rose-400 hover:text-rose-600 p-1"
                                  title="Apagar Histórico"
                                >
                                  <Icons.Trash />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* MOVIMENTAÇÕES */}
                  {activeDetailTab === "movimentacao" && (
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0">
                        <tr>
                          <th className="p-2">Data</th>
                          <th className="p-2">Tipo</th>
                          <th className="p-2">Qtd</th>
                          <th className="p-2">Motivo</th>
                          {isAdmin && (
                            <th className="p-2 text-center">Ações</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDetails.movimentacoes.map((m) => (
                          <tr
                            key={m.id}
                            className="border-b border-slate-50 hover:bg-slate-50"
                          >
                            <td className="p-2 text-slate-500">
                              {formatDate(m.data)}
                            </td>
                            <td className="p-2">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.tipo === "ENTRADA" ? "bg-emerald-100 text-emerald-700" : m.tipo === "SAIDA" ? "bg-orange-100 text-orange-700" : "bg-slate-100"}`}
                              >
                                {m.tipo}
                              </span>
                            </td>
                            <td className="p-2 font-bold">{m.qtd}</td>
                            <td className="p-2 text-slate-500 text-xs truncate max-w-[150px]">
                              {m.motivo}
                            </td>
                            {isAdmin && (
                              <td className="p-2 flex justify-center gap-2">
                                <button
                                  onClick={() =>
                                    handleAdminDeleteMovimentacao(m.id)
                                  }
                                  className="text-rose-400 hover:text-rose-600 p-1"
                                  title="Limpar Log"
                                >
                                  <Icons.Trash />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* MODAL EDITAR / NOVO (CRUD Padrão + Admin Overrides) */}
        <Modal
          open={modalOpen}
          title={editingId ? "Editar Produto" : "Novo Produto"}
          onClose={() => setModalOpen(false)}
        >
          <form className="space-y-6" onSubmit={handleSave}>
            {isAdmin && editingId && (
              <div className="bg-red-50 text-red-700 p-2 rounded text-xs font-bold text-center">
                ⚠️ MODO SUPER ADMIN: Edição direta de estoque habilitada.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Código de Barras
                </label>
                <input
                  className="w-full p-2.5 border rounded-lg bg-slate-50 focus:bg-white font-mono"
                  required
                  placeholder="Ex: 789..."
                  value={form.codigo_barras || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      codigo_barras: normalizeBarcodeValue(e.target.value),
                    })
                  }
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Descrição
                </label>
                <input
                  className="w-full p-2.5 border rounded-lg"
                  required
                  placeholder="Ex: Coca Cola 2L"
                  value={form.nome || ""}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Categoria
                </label>
                <select
                  className="w-full p-2.5 border rounded-lg bg-white"
                  value={form.categoria || ""}
                  onChange={(e) =>
                    setForm({ ...form, categoria: e.target.value })
                  }
                >
                  <option value="">Selecione...</option>
                  <option value="Festas">Festas</option>
                  <option value="Embalagens">Embalagens</option>
                  <option value="Doces">Doces</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Localização
                </label>
                <input
                  className="w-full p-2.5 border rounded-lg"
                  placeholder="Ex: Prateleira B"
                  value={form.localizacao || ""}
                  onChange={(e) =>
                    setForm({ ...form, localizacao: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-500"></span>{" "}
                Catálogo do Fornecedor
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Código do Catálogo
                  </label>
                  <input
                    className="w-full p-2.5 border rounded-lg"
                    value={form.codigoCatalogo || ""}
                    onChange={(e) =>
                      setForm({ ...form, codigoCatalogo: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Embalagem (Tipo)
                  </label>
                  <select
                    className="w-full p-2.5 border rounded-lg"
                    value={form.embalagemTipo || ""}
                    onChange={(e) =>
                      setForm({ ...form, embalagemTipo: e.target.value })
                    }
                  >
                    <option value="">Selecione...</option>
                    <option value="Caixa">Caixa</option>
                    <option value="Pacote">Pacote</option>
                    <option value="Pote">Pote</option>
                    <option value="Lata">Lata</option>
                    <option value="Rolo">Rolo</option>
                    <option value="Barril">Barril</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Embalagem (Unidade)
                  </label>
                  <select
                    className="w-full p-2.5 border rounded-lg"
                    value={form.embalagemUnidade || ""}
                    onChange={(e) =>
                      setForm({ ...form, embalagemUnidade: e.target.value })
                    }
                  >
                    <option value="">Selecione...</option>
                    <option value="Unidade">Unidade</option>
                    <option value="Litros">Litros</option>
                    <option value="Centímetros">Centímetros</option>
                    <option value="Metros">Metros</option>
                    <option value="Gramas">Gramas</option>
                    <option value="Kilos">Kilos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Embalagem (Quantidade)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full p-2.5 border rounded-lg"
                    value={form.embalagemQuantidade ?? 0}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        embalagemQuantidade: parseFloat(e.target.value || "0"),
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Preço por Embalagem
                  </label>
                  <CurrencyInput
                    value={form.precoEmbalagem || 0}
                    onChange={(val) =>
                      setForm({ ...form, precoEmbalagem: val })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Preço por Unidade
                  </label>
                  <CurrencyInput
                    value={form.precoUnidade || 0}
                    onChange={(val) => setForm({ ...form, precoUnidade: val })}
                  />
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>{" "}
                Granulação PDV
              </h4>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.granularAtivo)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      granularAtivo: e.target.checked,
                      granularTipo: e.target.checked
                        ? normalizeGranularTipo(prev.granularTipo) || "GRAMA"
                        : "",
                      granularProdutoPaiId: e.target.checked
                        ? prev.granularProdutoPaiId || ""
                        : "",
                      granularFatorConversao: e.target.checked
                        ? Number(prev.granularFatorConversao || 0)
                        : 0,
                    }))
                  }
                />
                Produto vendido de forma granular no PDV
              </label>

              {Boolean(form.granularAtivo) && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Tipo Granular
                      </label>
                      <select
                        className="w-full p-2.5 border rounded-lg bg-white"
                        value={normalizeGranularTipo(form.granularTipo) || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            granularTipo: normalizeGranularTipo(e.target.value),
                          })
                        }
                      >
                        <option value="">Selecione...</option>
                        <option value="GRAMA">Gramas</option>
                        <option value="UNIDADE">Unidade</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Produto Principal
                      </label>
                      <input
                        type="text"
                        className="w-full p-2.5 border rounded-lg bg-white font-mono"
                        placeholder="Digite código de barras, descrição ou local..."
                        value={granularParentQuery}
                        onFocus={() => setGranularParentSuggestionsOpen(true)}
                        onChange={(e) => {
                          const value = normalizeSearchInputValue(e.target.value);
                          setGranularParentQuery(value);
                          setGranularParentSuggestionsOpen(true);
                          setForm({
                            ...form,
                            granularProdutoPaiId: "",
                          });
                        }}
                      />
                      {granularParentSuggestionsOpen && (
                        <div className="mt-2 border border-slate-200 rounded-lg bg-white max-h-56 overflow-y-auto shadow-sm">
                          {filteredGranularParentOptions.length === 0 ? (
                            <div className="p-3 text-xs text-slate-400">
                              Nenhum produto encontrado para a busca.
                            </div>
                          ) : (
                            filteredGranularParentOptions.map((parent) => (
                              <button
                                key={parent.id}
                                type="button"
                                className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 hover:bg-amber-50 transition-colors ${form.granularProdutoPaiId === parent.id ? "bg-amber-50" : ""}`}
                                onClick={() => {
                                  setForm({
                                    ...form,
                                    granularProdutoPaiId: parent.id,
                                  });
                                  setGranularParentQuery(parent.codigo_barras);
                                  setGranularParentSuggestionsOpen(false);
                                }}
                              >
                                <div className="text-xs font-mono text-slate-500">
                                  {parent.codigo_barras}
                                </div>
                                <div className="text-sm font-semibold text-slate-700">
                                  {parent.nome}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Posição: {parent.localizacao || "Não informada"}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Granular por 1 Unidade do Principal
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="w-full p-2.5 border rounded-lg"
                        placeholder="Ex: 500 (gramas) ou 100 (unidades)"
                        value={Number(form.granularFatorConversao || 0)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            granularFatorConversao: parseFloat(
                              e.target.value || "0",
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                  {selectedGranularParent && (
                    <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 p-2 rounded-lg">
                      Produto principal vinculado:{" "}
                      <strong>{selectedGranularParent.nome}</strong> | Estoque
                      atual: <strong>{formatQty(selectedGranularParent.estoque)}</strong>{" "}
                      un
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Exemplo: se 1 pacote gera 500g para venda no balcão, informe
                    tipo <strong>Gramas</strong> e fator <strong>500</strong>.
                    Ao repor 500g, o sistema baixa 1 un do produto principal.
                  </p>
                </div>
              )}
            </div>
            <div className="border-t border-slate-200 pt-4">
              <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>{" "}
                Precificação
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Custo Médio{" "}
                    {isAdmin && (
                      <span className="text-red-500 text-[10px]">
                        (Editável)
                      </span>
                    )}
                  </label>
                  <CurrencyInput
                    className={`w-full p-2.5 border rounded-lg ${isAdmin ? "bg-white border-red-200 text-red-900 font-bold" : "bg-slate-50 text-slate-600"}`}
                    readOnly={!isAdmin}
                    value={form.custo_produto || 0}
                    onChange={(val) => setForm({ ...form, custo_produto: val })}
                  />
                </div>

                {/* Preço Varejo */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 text-emerald-600">
                    Varejo
                  </label>
                  <CurrencyInput
                    className="w-full p-2.5 border border-emerald-200 bg-emerald-50 rounded-lg font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500 outline-none pl-9"
                    value={form.preco_varejo || 0}
                    onChange={(val) => setForm({ ...form, preco_varejo: val })}
                    required
                  />
                </div>

                {/* Preço Atacado */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 text-indigo-600">
                    Atacado
                  </label>
                  <CurrencyInput
                    className="w-full p-2.5 border border-indigo-200 bg-indigo-50 rounded-lg font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none pl-9"
                    value={form.preco_atacado || 0}
                    onChange={(val) => setForm({ ...form, preco_atacado: val })}
                    required
                  />
                </div>

                {/* Margem Minima */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 text-slate-600">
                    Margem Minima (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full p-2.5 border rounded-lg"
                    value={form.margem_minima ?? 0}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        margem_minima: parseFloat(e.target.value || "0"),
                      })
                    }
                  />
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>{" "}
                Estoque
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Mín Atacado
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="w-full p-2.5 border rounded-lg"
                    required
                    value={form.qtd_atacado}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        qtd_atacado: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Estoque Atual{" "}
                    {isAdmin && (
                      <span className="text-red-500 text-[10px]">
                        (Editável)
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      className={`w-full p-2.5 border rounded-lg font-bold ${isAdmin ? "bg-white border-red-200 text-red-900" : "bg-slate-100 text-slate-600 cursor-not-allowed"}`}
                      readOnly={!isAdmin}
                      value={form.estoque}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          estoque: parseFloat(e.target.value || "0"),
                        })
                      }
                    />
                    {editingId && (
                      <button
                        type="button"
                        onClick={openAdjustModal}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs whitespace-nowrap border border-slate-300 transition-colors"
                      >
                        Ajustar Lotes
                      </button>
                    )}
                  </div>
                  {!isAdmin && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      O estoque só pode ser alterado via compras, vendas ou
                      ajuste manual.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-500"></span>{" "}
                Regras de Tributação
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    NCM
                  </label>
                  <input
                    className="w-full p-2.5 border rounded-lg font-mono"
                    maxLength={8}
                    value={form.ncm || ""}
                    onChange={(e) =>
                      setForm((prev) =>
                        applyTributacaoRules(
                          { ...prev, ncm: e.target.value },
                          "manual",
                        ),
                      )
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    CEST (Opcional)
                  </label>
                  <input
                    className="w-full p-2.5 border rounded-lg font-mono"
                    maxLength={7}
                    value={form.cest || ""}
                    onChange={(e) =>
                      setForm((prev) =>
                        applyTributacaoRules(
                          { ...prev, cest: e.target.value },
                          "cest",
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Tipo Tributação
                  </label>
                  <input
                    className="w-full p-2.5 border rounded-lg bg-slate-100 text-slate-700 font-bold"
                    value={form.tipo_tributacao || "NORMAL"}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Origem
                  </label>
                  <select
                    className="w-full p-2.5 border rounded-lg bg-white"
                    value={form.origem || "0"}
                    onChange={(e) =>
                      setForm((prev) =>
                        applyTributacaoRules(
                          { ...prev, origem: e.target.value },
                          "manual",
                        ),
                      )
                    }
                  >
                    <option value="0">0 - Nacional</option>
                    <option value="1">
                      1 - Estrangeira (importação direta)
                    </option>
                    <option value="2">2 - Estrangeira (mercado interno)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    CSOSN
                  </label>
                  <input
                    className={`w-full p-2.5 border rounded-lg font-mono ${form.tipo_tributacao === "NORMAL" ? "bg-slate-100 text-slate-600" : ""}`}
                    maxLength={3}
                    value={form.csosn || ""}
                    readOnly={form.tipo_tributacao === "NORMAL"}
                    onChange={(e) =>
                      setForm((prev) =>
                        applyTributacaoRules(
                          { ...prev, csosn: e.target.value },
                          "manual",
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    CFOP Padrão
                  </label>
                  <input
                    className={`w-full p-2.5 border rounded-lg font-mono ${form.tipo_tributacao === "NORMAL" ? "bg-slate-100 text-slate-600" : ""}`}
                    maxLength={4}
                    value={form.cfop_padrao || ""}
                    readOnly={form.tipo_tributacao === "NORMAL"}
                    onChange={(e) =>
                      setForm((prev) =>
                        applyTributacaoRules(
                          { ...prev, cfop_padrao: e.target.value },
                          "manual",
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    CST PIS
                  </label>
                  <input
                    className="w-full p-2.5 border rounded-lg font-mono"
                    maxLength={2}
                    value={form.cst_pis || ""}
                    onChange={(e) =>
                      setForm((prev) =>
                        applyTributacaoRules(
                          { ...prev, cst_pis: e.target.value },
                          "manual",
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    CST COFINS
                  </label>
                  <input
                    className="w-full p-2.5 border rounded-lg font-mono"
                    maxLength={2}
                    value={form.cst_cofins || ""}
                    onChange={(e) =>
                      setForm((prev) =>
                        applyTributacaoRules(
                          { ...prev, cst_cofins: e.target.value },
                          "manual",
                        ),
                      )
                    }
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-3">
                Regra automática: com CEST informado, o tipo tributação vira ST.
                Sem CEST, volta para NORMAL com CSOSN 101 e CFOP 5102.
              </p>
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700"
              >
                Salvar
              </button>
            </div>
          </form>
        </Modal>

        {/* MODAL AJUSTE DE ESTOQUE (LOTES) */}
        <Modal
          open={adjustModalOpen}
          title="Ajuste Manual de Estoque (Correção)"
          onClose={() => setAdjustModalOpen(false)}
        >
          <form onSubmit={handleConfirmAdjust} className="space-y-6">
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800 text-sm">
              <strong>Atenção:</strong> Utilize esta função apenas para corrigir
              divergências físicas (quebra, sobra, perda).
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-700 mb-2">
                Lotes Ativos
              </h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase sticky top-0">
                    <tr>
                      <th className="p-3">Lote</th>
                      <th className="p-3">Validade</th>
                      <th className="p-3 w-32">Qtd Atual</th>
                      <th className="p-3 w-32">Nova Qtd</th>
                      {isAdmin && <th className="p-3 text-center">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {adjustLotes.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-600">
                          {l.numeroLote}
                        </td>
                        <td className="p-3 text-slate-600">
                          {l.dataValidade
                            ? formatDate(l.dataValidade).split(" ")[0]
                            : "-"}
                        </td>
                        <td className="p-3 font-bold text-slate-700">
                          {l.qtdAtual}
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full p-1.5 border border-slate-300 rounded text-center font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                            value={l.qtdAtual}
                            onChange={(e) =>
                              handleAdjustLoteChange(
                                l.id,
                                parseFloat(e.target.value || "0"),
                              )
                            }
                          />
                        </td>
                        {isAdmin && (
                          <td className="p-3 flex justify-center">
                            <button
                              type="button"
                              onClick={() => handleAdminDeleteLote(l.id)}
                              className="text-rose-400 hover:text-rose-600"
                              title="Excluir Lote Permanentemente"
                            >
                              <Icons.Trash />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {adjustLotes.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="p-4 text-center text-slate-400"
                        >
                          Nenhum lote ativo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center mt-2 px-1">
                <span className="text-xs text-slate-500 font-bold uppercase">
                  Novo Estoque Total:
                </span>
                <span className="text-xl font-bold text-indigo-700">
                  {adjustLotes.reduce((acc, l) => acc + l.qtdAtual, 0)} un
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Justificativa (Obrigatório)
              </label>
              <textarea
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                rows={3}
                placeholder="Ex: Quebra de mercadoria na prateleira, contagem de inventário..."
                required
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              ></textarea>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
                className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-500/20">
                Confirmar Ajuste
              </button>
            </div>
          </form>
        </Modal>

        {/* MODAL REPOSIÇÃO GRANULAR */}
        <Modal
          open={replenishModalOpen}
          title="Reposição de Estoque Granular"
          onClose={() => setReplenishModalOpen(false)}
        >
          {!replenishProduct ? (
            <div className="text-sm text-slate-500">Produto não selecionado.</div>
          ) : (
            <form onSubmit={handleConfirmReplenish} className="space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <div>
                  Produto granular: <strong>{replenishProduct.nome}</strong>
                </div>
                <div className="mt-1">
                  Produto principal:{" "}
                  <strong>
                    {replenishProduct.granularProdutoPai?.nome || "Não vinculado"}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Quantidade para Repor ({getGranularUnitLabel(replenishProduct)})
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="w-full p-2.5 border rounded-lg font-bold"
                  value={replenishQty || ""}
                  onChange={(e) =>
                    setReplenishQty(parseFloat(e.target.value || "0"))
                  }
                  required
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 space-y-1">
                <div>
                  Conversão:{" "}
                  <strong>
                    {formatQty(Number(replenishProduct.granularFatorConversao || 0))}{" "}
                    {getGranularUnitLabel(replenishProduct)} = 1 un do principal
                  </strong>
                </div>
                <div>
                  Baixa prevista no principal:{" "}
                  <strong>{formatQty(replenishConsumption)} un</strong>
                </div>
                <div>
                  Estoque principal atual:{" "}
                  <strong>
                    {formatQty(Number(replenishProduct.granularProdutoPai?.estoque || 0))}{" "}
                    un
                  </strong>
                </div>
                <div>
                  Estoque principal após reposição:{" "}
                  <strong>
                    {formatQty(
                      Number(replenishProduct.granularProdutoPai?.estoque || 0) -
                        replenishConsumption,
                    )}{" "}
                    un
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Observação (Opcional)
                </label>
                <textarea
                  className="w-full p-2.5 border rounded-lg"
                  rows={3}
                  value={replenishReason}
                  onChange={(e) => setReplenishReason(e.target.value)}
                  placeholder="Ex: reposição para balcão de autoatendimento."
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReplenishModalOpen(false)}
                  className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button className="px-6 py-2.5 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700">
                  Confirmar Reposição
                </button>
              </div>
            </form>
          )}
        </Modal>

        {/* MODAL ADMIN CONFIRMATION */}
        <Modal
          open={adminActionModal.open}
          title={adminActionModal.title}
          onClose={() =>
            setAdminActionModal({ ...adminActionModal, open: false })
          }
        >
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              ⚠️
            </div>
            <p className="text-slate-600">{adminActionModal.message}</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() =>
                  setAdminActionModal({ ...adminActionModal, open: false })
                }
                className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  adminActionModal.onConfirm();
                  setAdminActionModal({ ...adminActionModal, open: false });
                }}
                className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-lg"
              >
                Confirmar Ação de Admin
              </button>
            </div>
          </div>
        </Modal>

        {/* MODAL NECESSIDADE DE COMPRA */}
        <Modal
          open={reorderOpen}
          title="Necessidade de Compra (por nível de estoque)"
          onClose={() => setReorderOpen(false)}
        >
          <div className="space-y-4">
            <div className="text-sm text-slate-500">
              Produtos com nível de estoque menor ou igual ao prazo (dias) do
              fornecedor.
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Fornecedor</th>
                    <th className="p-3">Prazo (dias)</th>
                    <th className="p-3">Nível (dias)</th>
                    <th className="p-3">Estoque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {produtosRepor.map((p) => {
                    const daily = p.giroDiario ?? (p.giroMensal || 0) / 30;
                    const days =
                      daily > 0 ? Math.floor(p.estoque / daily) : 9999;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-bold">{p.nome}</div>
                          <div className="text-[10px] text-slate-400">
                            {p.codigo_barras}
                          </div>
                        </td>
                        <td className="p-3">{p.fornecedor?.nome || "-"}</td>
                        <td className="p-3">
                          {p.fornecedor?.prazoEntrega || "-"}
                        </td>
                        <td className="p-3">
                          {daily > 0 ? `${days} dias` : "Sem giro"}
                        </td>
                        <td className="p-3">{p.estoque}</td>
                      </tr>
                    );
                  })}
                  {produtosRepor.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-6 text-center text-slate-400"
                      >
                        Nenhum produto abaixo do prazo de reposição.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      </div>

      {/* MODAL ETIQUETAS */}
      <Modal
        open={labelModalOpen}
        title="Etiquetas de Produtos"
        onClose={() => setLabelModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <input
                className="w-full p-2 border rounded-lg text-sm md:flex-1"
                placeholder="Buscar por descricao, codigo de barras ou localizacao..."
                value={labelSearch}
                onChange={(e) => setLabelSearch(e.target.value)}
              />
              <button
                onClick={handleGenerateLabels}
                disabled={!hasSelectedLabels}
                className="w-full md:w-auto md:min-w-[180px] bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-4 rounded-lg font-bold disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
              >
                Gerar Etiquetas
              </button>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allLabelsSelected}
                  onChange={() =>
                    allLabelsSelected ? clearAllLabels() : selectAllLabels()
                  }
                />
                Selecionar Todos
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={noneLabelsSelected}
                  onChange={() =>
                    noneLabelsSelected ? selectAllLabels() : clearAllLabels()
                  }
                />
                Desmarcar Todos
              </label>
              <span className="text-xs text-slate-500">
                {selectedLabelIds.length} selecionado(s)
              </span>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
                <tr>
                  <th className="p-3">Codigo</th>
                  <th className="p-3">Descricao</th>
                  <th className="p-3">Localizacao</th>
                  <th className="p-3 text-right">Preco Varejo</th>
                  <th className="p-3 text-right">Preco Atacado</th>
                  <th className="p-3 text-center">Qtd Atacado</th>
                  <th className="p-3 text-center">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredLabelProdutos.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-slate-400" colSpan={7}>
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredLabelProdutos.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs text-slate-600">
                        {p.codigo_barras}
                      </td>
                      <td className="p-3 text-slate-700 font-medium">
                        {p.nome}
                      </td>
                      <td className="p-3 text-slate-500">
                        {p.localizacao || "-"}
                      </td>
                      <td className="p-3 text-right font-semibold text-slate-700">
                        {formatMoney(p.preco_varejo)}
                      </td>
                      <td className="p-3 text-right font-semibold text-indigo-600">
                        {formatMoney(p.preco_atacado)}
                      </td>
                      <td className="p-3 text-center text-slate-600">
                        {p.qtd_atacado}
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={!!labelSelection[p.id]}
                          onChange={() => toggleLabelSelection(p.id)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
