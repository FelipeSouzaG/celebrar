import { FormEvent, useEffect, useMemo, useState } from "react";
import { adminApi } from "../api";
import { Icons } from "../components/Icons";
import { CurrencyInput, Modal } from "../components/Shared";
import {
  Compra,
  ContaBancaria,
  Fornecedor,
  ItemCompra,
  Produto,
} from "../types";
import {
  formatCPFCNPJ,
  formatDate,
  formatDateOnly,
  formatMoney,
  toInputDate,
  todayInputDate,
} from "../utils";

interface CompraForm {
  referencia: string;
  fornecedorId: string;
  data_compra: string;
  itens: ItemCompra[];
  frete: number;
  outrasDespesas: number;
  descontoGeral: number;
  // Financeiro
  status: "PENDENTE" | "PAGO";
  dataVencimento: string;
  dataPagamento: string;
  contaBancariaId: string;
  parcelas: number;
  // Novos campos para pagamento PENDENTE
  formaPagamento?: "DINHEIRO_CAIXA" | "BOLETO";
  numeroParcelas?: number;
}

const initialForm: CompraForm = {
  referencia: "",
  fornecedorId: "",
  data_compra: todayInputDate(),
  itens: [],
  frete: 0,
  outrasDespesas: 0,
  descontoGeral: 0,
  status: "PENDENTE",
  dataVencimento: todayInputDate(),
  dataPagamento: todayInputDate(),
  contaBancariaId: "",
  parcelas: 1,
  formaPagamento: "DINHEIRO_CAIXA",
  numeroParcelas: 1,
};

export function ComprasTab() {
  const [compras, setCompras] = useState<Compra[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);

  // Filters State
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CompraForm>(initialForm);

  // Temp Item state includes Lot info now
  const [tempItem, setTempItem] = useState<{
    produtoId: string;
    qtd: number;
    custo_un: number;
    numeroLote: string;
    dataValidade: string;
  }>({
    produtoId: "",
    qtd: 1,
    custo_un: 0,
    numeroLote: "",
    dataValidade: "",
  });

  // Supplier Search State
  const [supplierSearch, setSupplierSearch] = useState("");
  const [filteredSuppliers, setFilteredSuppliers] = useState<Fornecedor[]>([]);
  const [showSupplierList, setShowSupplierList] = useState(false);

  // Product Search State (New)
  const [productSearch, setProductSearch] = useState("");
  const [showProductList, setShowProductList] = useState(false);
  const [filteredProducts, setFilteredProducts] = useState<Produto[]>([]);

  const loadData = async () => {
    try {
      const [c, f, p, b] = await Promise.all([
        adminApi.getCompras(),
        adminApi.getFornecedores(),
        adminApi.getProdutos(),
        adminApi.getContas({ tipo_uso: "PAGAMENTO" }),
      ]);
      setCompras(c);
      setFornecedores(f);
      setProdutos(p);
      setContas(b);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter Logic
  const filteredCompras = useMemo(() => {
    return compras.filter((c) => {
      // Text Search
      const term = searchTerm.toLowerCase();
      if (term) {
        const refMatch = (c.referencia || "").toLowerCase().includes(term);
        const supplierMatch = (c.fornecedor?.nome || "")
          .toLowerCase()
          .includes(term);
        if (!refMatch && !supplierMatch) return false;
      }

      // Status Filter
      if (statusFilter !== "TODOS") {
        const s = c.status || "PAGO";
        if (s !== statusFilter) return false;
      }

      // Date Range
      const d = new Date(c.data_compra);
      if (dateStart && d < new Date(dateStart)) return false;
      if (dateEnd) {
        const end = new Date(dateEnd);
        end.setHours(23, 59, 59);
        if (d > end) return false;
      }

      return true;
    });
  }, [compras, searchTerm, statusFilter, dateStart, dateEnd]);

  // Supplier Filter Logic
  useEffect(() => {
    if (!supplierSearch.trim()) {
      setFilteredSuppliers([]);
      return;
    }
    const term = supplierSearch.toLowerCase();
    const matches = fornecedores.filter(
      (f) =>
        f.nome.toLowerCase().includes(term) ||
        (f.cnpj && f.cnpj.includes(term)),
    );
    setFilteredSuppliers(matches);
  }, [supplierSearch, fornecedores]);

  // Product Filter Logic
  useEffect(() => {
    if (!productSearch.trim()) {
      setFilteredProducts([]);
      return;
    }
    const term = productSearch.toLowerCase();
    const matches = produtos
      .filter(
        (p) =>
          p.nome.toLowerCase().includes(term) ||
          p.codigo_barras.includes(term) ||
          (p.localizacao && p.localizacao.toLowerCase().includes(term)),
      )
      .slice(0, 15); // Limit to 15 results for performance
    setFilteredProducts(matches);
  }, [productSearch, produtos]);

  const selectSupplier = (f: Fornecedor) => {
    setForm({ ...form, fornecedorId: f.id });
    setSupplierSearch("");
    setShowSupplierList(false);
  };

  const selectProduct = async (p: Produto) => {
    // 1. Set basic info first
    setTempItem({
      ...tempItem,
      produtoId: p.id,
      custo_un: p.custo_produto,
      numeroLote: "Carregando...", // Feedback visual
    });
    setProductSearch(p.nome);
    setShowProductList(false);

    // 2. Fetch details to calculate next Lot
    try {
      const details = await adminApi.getProdutoDetalhes(p.id);
      const activeLots = details.lotes.filter((l) => l.status === "ATIVO");

      let nextLot = "";
      const today = new Date();
      const yearMonth = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, "0")}`; // YYYYMM

      if (p.estoque <= 0 || activeLots.length === 0) {
        // Scenario 1: Zero Stock or No Active Lots -> Start with A
        nextLot = `A-${yearMonth}`;
      } else {
        // Scenario 2: Has Stock -> Find max letter in active lots
        // Extract letters from lots that match pattern X-YYYYMM or just X
        const letters = activeLots
          .map((l) => {
            const match = l.numeroLote.match(/^([A-Z])-?/);
            return match ? match[1] : null;
          })
          .filter((l) => l !== null) as string[];

        if (letters.length > 0) {
          letters.sort(); // A, B, C...
          const lastLetter = letters[letters.length - 1];
          const nextCharCode = lastLetter.charCodeAt(0) + 1;
          const nextLetter = String.fromCharCode(nextCharCode);
          nextLot = `${nextLetter}-${yearMonth}`;
        } else {
          // Fallback if current lots don't follow pattern
          nextLot = `A-${yearMonth}`;
        }
      }

      setTempItem((prev) => ({ ...prev, numeroLote: nextLot }));
    } catch (e) {
      console.error("Erro ao gerar lote automático", e);
      setTempItem((prev) => ({ ...prev, numeroLote: "" })); // Fallback to empty
    }
  };

  const addItem = () => {
    if (!tempItem.produtoId || tempItem.qtd <= 0) return;
    setForm((prev) => ({ ...prev, itens: [...prev.itens, { ...tempItem }] }));

    // Reset inputs but keep context if needed
    setTempItem({
      ...tempItem,
      produtoId: "",
      qtd: 1,
      custo_un: 0,
      numeroLote: "",
    });
    setProductSearch("");
  };

  const removeItem = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      itens: prev.itens.filter((_, i) => i !== idx),
    }));
  };

  const handleOpenModal = (compra?: Compra) => {
    if (compra) {
      setEditingId(compra.id);
      setForm({
        referencia: compra.referencia || "",
        fornecedorId: compra.fornecedorId,
        data_compra: compra.data_compra
          ? toInputDate(compra.data_compra)
          : initialForm.data_compra,
        itens: compra.itens.map((i) => ({
          produtoId: i.produtoId,
          qtd: i.qtd,
          custo_un: i.custo_un,
          numeroLote: i.numeroLote,
          dataValidade: i.dataValidade ? toInputDate(i.dataValidade) : "",
        })),
        frete: compra.frete || 0,
        outrasDespesas: compra.outrasDespesas || 0,
        descontoGeral: compra.descontoGeral || 0,
        status: compra.status || "PAGO",
        dataVencimento: compra.dataVencimento
          ? toInputDate(compra.dataVencimento)
          : initialForm.dataVencimento,
        dataPagamento: compra.dataPagamento
          ? toInputDate(compra.dataPagamento)
          : initialForm.dataPagamento,
        contaBancariaId: compra.contaBancariaId || "",
        parcelas:
          compra.despesasGeradas && compra.despesasGeradas.length > 0
            ? compra.despesasGeradas.length
            : 1,
        formaPagamento: compra.formaPagamento || "DINHEIRO_CAIXA",
        numeroParcelas: compra.numeroParcelas || 1,
      });
      setSupplierSearch(compra.fornecedor?.nome || "");
    } else {
      setEditingId(null);
      setForm(initialForm);
      setSupplierSearch("");
    }
    setModalOpen(true);
    // Reset product search states
    setProductSearch("");
    setTempItem({
      produtoId: "",
      qtd: 1,
      custo_un: 0,
      numeroLote: "",
      dataValidade: "",
    });
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.fornecedorId) return alert("Selecione um fornecedor.");
    if (form.itens.length === 0) return alert("Adicione itens à nota.");

    if (form.status === "PAGO") {
      if (!form.dataPagamento) return alert("Informe a data do pagamento.");
      if (!form.contaBancariaId && form.contaBancariaId !== "")
        return alert("Selecione a conta de onde saiu o dinheiro.");
    } else {
      if (!form.dataVencimento) return alert("Informe a data de vencimento.");
      if (!form.formaPagamento) return alert("Selecione a forma de pagamento.");
      if (
        form.formaPagamento === "BOLETO" &&
        (!form.numeroParcelas || form.numeroParcelas < 1)
      ) {
        return alert("Informe o número de parcelas para boleto.");
      }
    }

    try {
      if (editingId) {
        if (
          !confirm(
            "Ao editar, o sistema irá reverter o estoque e financeiro antigos e criar novos registros. Confirmar?",
          )
        )
          return;
        await adminApi.updateCompra(editingId, form);
      } else {
        await adminApi.createCompra(form);
      }
      setModalOpen(false);
      setForm(initialForm);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "ATENÇÃO: Isso excluirá o registro da compra, removerá os itens do estoque e cancelará todas as despesas financeiras/faturas geradas por ela. Continuar?",
      )
    )
      return;
    try {
      await adminApi.deleteCompra(id);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Calculations
  const totalItens = form.itens.reduce((acc, i) => acc + i.qtd * i.custo_un, 0);
  const totalGeral = Math.max(
    0,
    totalItens + form.frete + form.outrasDespesas - form.descontoGeral,
  );

  const selectedSupplierObj = fornecedores.find(
    (f) => f.id === form.fornecedorId,
  );
  const selectedContaObj = contas.find((c) => c.id === form.contaBancariaId);
  const isCredito = selectedContaObj?.tipo === "Crédito";

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* HEADER PERSONALIZADO */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <h3 className="text-xl font-bold text-slate-800">Entrada de Notas</h3>
        <button
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold flex gap-2 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
        >
          <Icons.Plus /> Nova Nota
        </button>
      </div>

      <div className="p-8 space-y-4 max-w-screen-2xl mx-auto w-full animate-fadeIn">
        {/* FILTROS DE PESQUISA (Mantidos) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* ... Filters UI ... */}
          <div className="md:col-span-4 flex items-center gap-2">
            <input
              type="date"
              className="w-full p-2 text-sm border rounded-lg text-slate-600"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
            />
            <span className="text-slate-400 text-xs font-bold">ATÉ</span>
            <input
              type="date"
              className="w-full p-2 text-sm border rounded-lg text-slate-600"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
            />
          </div>
          <div className="md:col-span-6 relative">
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
              placeholder="Buscar por referência ou fornecedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <select
              className="w-full p-2 text-sm border rounded-lg bg-white font-medium text-slate-600"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="TODOS">Status: Todos</option>
              <option value="PAGO">✅ Pagos</option>
              <option value="PENDENTE">🕒 Pendentes</option>
            </select>
          </div>
        </div>

        {/* TABELA DE COMPRAS */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Data
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Ref.
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Fornecedor
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Itens
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Total Nota
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredCompras.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-600 font-mono text-sm">
                    {formatDate(c.data_compra).split(" ")[0]}
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500">
                    {c.codigo || c.referencia || "-"}
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-800">
                    {c.fornecedor?.nome}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {c.itens.length} itens
                  </td>
                  <td className="px-6 py-4 font-bold text-indigo-700">
                    {formatMoney(c.total)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${c.status === "PAGO" ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-700"}`}
                    >
                      {c.status || "PAGO"}
                    </span>
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    <button
                      onClick={() => handleOpenModal(c)}
                      className="text-indigo-600 p-2 hover:bg-indigo-50 rounded"
                      title="Editar"
                    >
                      <Icons.Edit />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-rose-500 p-2 hover:bg-rose-50 rounded"
                      title="Excluir"
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
        title={
          editingId
            ? "Editar Nota (Reversão Completa)"
            : "Registrar Entrada de Nota Fiscal"
        }
        onClose={() => setModalOpen(false)}
      >
        <form className="space-y-6" onSubmit={handleSave}>
          {editingId && (
            <div className="bg-orange-50 border border-orange-200 text-orange-800 text-xs p-3 rounded-lg mb-4">
              <strong>Modo de Edição:</strong> Ao salvar, o sistema irá reverter
              a entrada de estoque anterior e cancelar os lançamentos
              financeiros antigos, criando novos registros com os dados abaixo.
            </div>
          )}

          {/* --- CABEÇALHO DA NOTA --- */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="md:col-span-8 relative">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Fornecedor
              </label>
              {!form.fornecedorId ? (
                <div className="relative">
                  <input
                    className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Digite Nome ou CNPJ para buscar..."
                    value={supplierSearch}
                    onChange={(e) => {
                      setSupplierSearch(e.target.value);
                      setShowSupplierList(true);
                    }}
                    onFocus={() => setShowSupplierList(true)}
                  />
                  {showSupplierList && filteredSuppliers.length > 0 && (
                    <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-48 overflow-y-auto">
                      {filteredSuppliers.map((f) => (
                        <li
                          key={f.id}
                          onClick={() => selectSupplier(f)}
                          className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0"
                        >
                          <div className="font-bold text-slate-800">
                            {f.nome}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatCPFCNPJ(f.cnpj)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="flex justify-between items-center bg-white p-2.5 border rounded-lg border-indigo-200 shadow-sm">
                  <div>
                    <div className="font-bold text-indigo-900">
                      {selectedSupplierObj?.nome || supplierSearch}
                    </div>
                    <div className="text-xs text-indigo-500 font-mono">
                      {formatCPFCNPJ(selectedSupplierObj?.cnpj)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, fornecedorId: "" })}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
                  >
                    Alterar
                  </button>
                </div>
              )}
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Nº Nota / Referência
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                value={form.referencia}
                onChange={(e) =>
                  setForm({ ...form, referencia: e.target.value })
                }
                placeholder="Ex: 12345"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Data da Compra
              </label>
              <input
                type="date"
                className="w-full p-2.5 border rounded-lg"
                value={form.data_compra}
                onChange={(e) =>
                  setForm({ ...form, data_compra: e.target.value })
                }
              />
            </div>
          </div>

          {/* --- ITENS DA NOTA (NOVA UX) --- */}
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs">
                1
              </span>{" "}
              Itens da Nota
            </h4>
            <div className="border border-slate-200 rounded-lg overflow-visible">
              <div className="bg-slate-100 p-3 grid grid-cols-12 gap-2 items-end border-b border-slate-200 relative">
                {/* PRODUCT AUTOCOMPLETE */}
                <div className="col-span-4 relative">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Produto (Busca)
                  </label>
                  <input
                    type="text"
                    className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Nome ou Código..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductList(true);
                    }}
                    onFocus={() => setShowProductList(true)}
                  />
                  {showProductList && productSearch.length > 0 && (
                    <ul className="absolute left-0 top-full mt-1 w-full sm:w-[300px] bg-white border border-slate-200 rounded-lg shadow-2xl z-50 max-h-60 overflow-y-auto">
                      {filteredProducts.length === 0 ? (
                        <li className="p-3 text-xs text-slate-400">
                          Nenhum produto encontrado.
                        </li>
                      ) : (
                        filteredProducts.map((p) => (
                          <li
                            key={p.id}
                            onClick={() => selectProduct(p)}
                            className="p-2 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0"
                          >
                            <div className="font-bold text-slate-800 text-sm">
                              {p.nome}
                            </div>
                            <div className="flex gap-2 text-[10px] text-slate-500">
                              <span className="bg-slate-100 px-1 rounded border">
                                {p.codigo_barras}
                              </span>
                              <span>Est: {p.estoque}</span>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>

                <div className="col-span-2 sm:col-span-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Lote/Ref
                  </label>
                  <input
                    type="text"
                    className="w-full p-2 border rounded text-sm bg-slate-200 text-slate-500 cursor-not-allowed font-mono text-center"
                    placeholder="Auto"
                    value={tempItem.numeroLote}
                    readOnly
                    disabled
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Validade
                  </label>
                  <input
                    type="date"
                    className="w-full p-2 border rounded text-sm"
                    value={tempItem.dataValidade}
                    onChange={(e) =>
                      setTempItem({ ...tempItem, dataValidade: e.target.value })
                    }
                  />
                </div>
                <div className="col-span-2 sm:col-span-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Qtd
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full p-2 border rounded text-sm"
                    value={tempItem.qtd}
                    onChange={(e) =>
                      setTempItem({
                        ...tempItem,
                        qtd: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="col-span-2 sm:col-span-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Custo (R$)
                  </label>
                  <CurrencyInput
                    className="w-full p-2 border rounded text-sm"
                    value={tempItem.custo_un}
                    onChange={(val) =>
                      setTempItem({ ...tempItem, custo_un: val })
                    }
                  />
                </div>
                <div className="col-span-1">
                  <button
                    type="button"
                    onClick={addItem}
                    className="w-full h-9 mt-5 bg-indigo-600 text-white rounded text-sm font-bold hover:bg-indigo-700 flex items-center justify-center"
                  >
                    <Icons.Plus />
                  </button>
                </div>
              </div>

              <div className="max-h-40 overflow-y-auto">
                {form.itens.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">
                    Nenhum item adicionado.
                  </div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white text-slate-500 border-b">
                      <tr>
                        <th className="p-2">Produto</th>
                        <th className="p-2">Lote/Val.</th>
                        <th className="p-2 w-16">Qtd</th>
                        <th className="p-2 w-24">Custo</th>
                        <th className="p-2 w-24">Subtotal</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.itens.map((it, idx) => {
                        const prod = produtos.find(
                          (p) => p.id === it.produtoId,
                        );
                        return (
                          <tr
                            key={idx}
                            className="border-b last:border-0 hover:bg-slate-50"
                          >
                            <td className="p-2 truncate max-w-[150px]">
                              {prod?.nome}
                            </td>
                            <td className="p-2 text-xs">
                              {it.numeroLote && (
                                <div className="font-mono text-slate-600">
                                  L: {it.numeroLote}
                                </div>
                              )}
                              {it.dataValidade && (
                                <div className="text-rose-600 font-bold">
                                  V: {formatDateOnly(it.dataValidade)}
                                </div>
                              )}
                            </td>
                            <td className="p-2">{it.qtd}</td>
                            <td className="p-2">{formatMoney(it.custo_un)}</td>
                            <td className="p-2 font-bold">
                              {formatMoney(it.qtd * it.custo_un)}
                            </td>
                            <td className="p-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="text-rose-500 hover:text-rose-700"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="bg-slate-50 p-2 text-right text-xs font-bold text-slate-600 border-t border-slate-200">
                Subtotal Itens: {formatMoney(totalItens)}
              </div>
            </div>
          </div>

          {/* --- CUSTOS ADICIONAIS (Com CurrencyInput) --- */}
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs">
                2
              </span>{" "}
              Custos Adicionais (Rateio)
            </h4>
            <div className="grid grid-cols-3 gap-4 bg-orange-50 p-4 rounded-xl border border-orange-100">
              <div>
                <label className="text-xs font-bold text-orange-800 uppercase">
                  Frete (R$)
                </label>
                <CurrencyInput
                  className="w-full p-2 border border-orange-200 rounded text-sm focus:border-orange-400 pl-8 bg-white"
                  value={form.frete}
                  onChange={(val) => setForm({ ...form, frete: val })}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-orange-800 uppercase">
                  Outras Despesas (R$)
                </label>
                <CurrencyInput
                  className="w-full p-2 border border-orange-200 rounded text-sm focus:border-orange-400 pl-8 bg-white"
                  value={form.outrasDespesas}
                  onChange={(val) => setForm({ ...form, outrasDespesas: val })}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-orange-800 uppercase">
                  Desconto Geral (R$)
                </label>
                <CurrencyInput
                  className="w-full p-2 border border-orange-200 rounded text-sm focus:border-orange-400 pl-8 bg-white"
                  value={form.descontoGeral}
                  onChange={(val) => setForm({ ...form, descontoGeral: val })}
                />
              </div>
            </div>
          </div>

          {/* --- FINANCEIRO --- */}
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs">
                3
              </span>{" "}
              Financeiro
            </h4>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded border border-slate-200 hover:border-indigo-300">
                  <input
                    type="radio"
                    name="status"
                    value="PENDENTE"
                    checked={form.status === "PENDENTE"}
                    onChange={() =>
                      setForm({
                        ...form,
                        status: "PENDENTE",
                        formaPagamento: "DINHEIRO_CAIXA",
                        numeroParcelas: 1,
                      })
                    }
                    className="accent-rose-600"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Pendente (A Pagar)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded border border-slate-200 hover:border-emerald-300">
                  <input
                    type="radio"
                    name="status"
                    value="PAGO"
                    checked={form.status === "PAGO"}
                    onChange={() =>
                      setForm({
                        ...form,
                        status: "PAGO",
                        formaPagamento: undefined,
                      })
                    }
                    className="accent-emerald-600"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Pago / Cartão
                  </span>
                </label>
              </div>

              {form.status === "PAGO" ? (
                <div className="animate-fadeIn space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">
                        Data Pagamento/Compra
                      </label>
                      <input
                        type="date"
                        className="w-full p-2 border rounded text-sm"
                        value={form.dataPagamento}
                        onChange={(e) =>
                          setForm({ ...form, dataPagamento: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">
                        Conta de Saída
                      </label>
                      <select
                        className="w-full p-2 border rounded text-sm bg-white"
                        value={form.contaBancariaId}
                        onChange={(e) =>
                          setForm({ ...form, contaBancariaId: e.target.value })
                        }
                      >
                        <option value="">Selecione...</option>
                        <option value="CAIXA">💵 Dinheiro do Caixa</option>
                        {contas
                          .filter(
                            (c) => c.ativa || c.id === form.contaBancariaId,
                          )
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              🏦 {c.nome} ({c.tipo})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {isCredito && (
                    <div className="bg-indigo-100 p-3 rounded-lg border border-indigo-200 animate-fadeIn">
                      <label className="text-xs font-bold text-indigo-800 uppercase">
                        Parcelamento no Cartão
                      </label>
                      <select
                        className="w-full mt-1 p-2 border border-indigo-300 rounded text-sm bg-white"
                        value={form.parcelas}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            parcelas: parseInt(e.target.value),
                          })
                        }
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(
                          (p) => (
                            <option key={p} value={p}>
                              {p}x de {formatMoney(totalGeral / p)}
                            </option>
                          ),
                        )}
                      </select>
                      <div className="text-[10px] text-indigo-600 mt-2">
                        As despesas serão geradas automaticamente na fatura
                        conforme o dia de fechamento do cartão.
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="animate-fadeIn space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">
                        Data de Vencimento
                      </label>
                      <input
                        type="date"
                        className="w-full p-2 border rounded text-sm"
                        value={form.dataVencimento}
                        onChange={(e) =>
                          setForm({ ...form, dataVencimento: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">
                        Forma de Pagamento
                      </label>
                      <select
                        className="w-full p-2 border rounded text-sm bg-white"
                        value={form.formaPagamento || "DINHEIRO_CAIXA"}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            formaPagamento: e.target.value as
                              | "DINHEIRO_CAIXA"
                              | "BOLETO",
                            numeroParcelas: e.target.value === "BOLETO" ? 1 : 1,
                          })
                        }
                      >
                        <option value="DINHEIRO_CAIXA">
                          💵 Dinheiro do Caixa
                        </option>
                        <option value="BOLETO">📄 Boleto Bancário</option>
                      </select>
                    </div>
                  </div>

                  {form.formaPagamento === "BOLETO" && (
                    <div className="bg-rose-50 p-3 rounded-lg border border-rose-200 animate-fadeIn">
                      <label className="text-xs font-bold text-rose-800 uppercase">
                        Número de Parcelas
                      </label>
                      <select
                        className="w-full mt-1 p-2 border border-rose-300 rounded text-sm bg-white"
                        value={form.numeroParcelas || 1}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            numeroParcelas: parseInt(e.target.value),
                          })
                        }
                      >
                        {Array.from({ length: 5 }, (_, i) => i + 1).map((p) => (
                          <option key={p} value={p}>
                            {p}x de {formatMoney(totalGeral / p)}
                          </option>
                        ))}
                      </select>
                      <div className="text-[10px] text-rose-600 mt-2">
                        As parcelas serão geradas automaticamente no Fluxo de
                        Caixa com status pendente, com vencimento a cada mês.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* --- TOTAL E AÇÃO --- */}
          <div className="flex justify-between items-center pt-4 border-t border-slate-200">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-500 uppercase">
                Total Geral da Nota
              </span>
              <span className="text-2xl font-bold text-indigo-700">
                {formatMoney(totalGeral)}
              </span>
            </div>
            <button className="bg-indigo-600 text-white py-3 px-8 rounded-lg font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-500/30">
              {editingId ? "Salvar Alterações" : "Concluir Entrada"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

