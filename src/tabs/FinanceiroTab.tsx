import { FormEvent, useEffect, useMemo, useState } from "react";
import { adminApi } from "../api";
import { Icons } from "../components/Icons";
import { CurrencyInput, Modal, Table } from "../components/Shared";
import {
  ContabilidadeTipo,
  ContaBancaria,
  DespesaPayload,
  ExtratoConta,
  ExtratoItem,
  NotaContabilidadeItem,
  TransacaoFinanceira,
} from "../types";
import { formatDateOnly, formatMoney, toInputDate, todayInputDate } from "../utils";

const emptyDespesaForm: DespesaPayload = {
  descricao: "",
  valor: 0,
  categoria: "Custo Fixo",
  status: "PENDENTE",
  dataVencimento: todayInputDate(),
  dataPagamento: "",
  contaBancariaId: "",
  parcelas: 1,
};

export function FinanceiroTab() {
  const [rawExtrato, setRawExtrato] = useState<TransacaoFinanceira[]>([]);

  // --- COMPETÊNCIA & FILTROS ---
  const [competencia, setCompetencia] = useState(
    todayInputDate().slice(0, 7),
  ); // YYYY-MM
  const [filters, setFilters] = useState({
    term: "",
    status: "TODOS", // TODOS, PAGO, PENDENTE
    tipo: "TODOS", // TODOS, ENTRADA, SAIDA
    dataIni: "",
    dataFim: "",
  });

  // --- Modal States ---
  const [modalDespesaOpen, setModalDespesaOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDespesa, setFormDespesa] =
    useState<DespesaPayload>(emptyDespesaForm);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    id: "",
    descricao: "",
    valorOriginal: 0,
    valorPago: 0,
    dataPagamento: "",
    contaBancariaId: "",
  });

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    onConfirm: () => void;
  }>({ open: false, title: "", onConfirm: () => {} });

  const [contasModalOpen, setContasModalOpen] = useState(false);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [newContaForm, setNewContaForm] = useState({
    nome: "",
    tipo: "Pix/Débito",
    nomeAportador: "",
    diaFechamento: "",
    diaVencimento: "",
  });
  const [showNewContaForm, setShowNewContaForm] = useState(false);

  const [contabilidadeModalOpen, setContabilidadeModalOpen] = useState(false);
  const [contabilidadeFiltros, setContabilidadeFiltros] = useState<{
    tipo: ContabilidadeTipo;
    dataIni: string;
    dataFim: string;
  }>({
    tipo: "ENTRADA",
    dataIni: `${todayInputDate().slice(0, 7)}-01`,
    dataFim: todayInputDate(),
  });
  const [contabilidadeNotas, setContabilidadeNotas] = useState<
    NotaContabilidadeItem[]
  >([]);
  const [loadingContabilidadeNotas, setLoadingContabilidadeNotas] =
    useState(false);
  const [exportingContabilidadeZip, setExportingContabilidadeZip] =
    useState(false);
  const [contabilidadeError, setContabilidadeError] = useState("");

  const [extratoModalOpen, setExtratoModalOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<ContaBancaria | null>(
    null,
  );
  const [extratoContaData, setExtratoContaData] = useState<ExtratoConta | null>(
    null,
  );
  const [extratoPeriod, setExtratoPeriod] = useState({
    mes: new Date().getMonth() + 1,
    ano: new Date().getFullYear(),
  });

  const [quickEditModal, setQuickEditModal] = useState<{
    open: boolean;
    item: ExtratoItem | null;
  }>({ open: false, item: null });
  const [quickForm, setQuickForm] = useState({ descricao: "", valor: 0 });
  const [parcelaWarningOpen, setParcelaWarningOpen] = useState(false);
  const [pagarAporteModalOpen, setPagarAporteModalOpen] = useState(false);
  const [pagarAporteForm, setPagarAporteForm] = useState({
    valor: 0,
    dataPagamento: todayInputDate(),
    contaPagamentoId: "CAIXA",
    descricao: "",
  });

  // Carrega apenas contas de PAGAMENTO para as operações financeiras
  const loadData = async () => {
    try {
      const [e, c] = await Promise.all([
        adminApi.getExtratoFinanceiro(),
        adminApi.getContas({ tipo_uso: "PAGAMENTO" }), // Filtro aplicado
      ]);
      setRawExtrato(e);
      setContas(c);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --- CALCULATION ENGINE ---
  const dashboardData = useMemo(() => {
    if (rawExtrato.length === 0)
      return {
        saldoAnterior: 0,
        entradasMes: 0,
        saidasMes: 0,
        saidasPrevistas: 0,
        saldoAtual: 0,
        filteredList: [],
      };

    const [ano, mes] = competencia.split("-").map(Number);
    const startOfCompetencia = new Date(ano, mes - 1, 1);
    const endOfCompetencia = new Date(ano, mes, 0, 23, 59, 59);

    let saldoAnterior = 0;
    let entradasMes = 0;
    let saidasMes = 0;
    let saidasPrevistas = 0;

    const currentList = [];

    for (const t of rawExtrato) {
      const dataEfetiva = t.dataPagamento
        ? new Date(t.dataPagamento)
        : new Date(t.data);
      const dataCompetencia = t.dataVencimento
        ? new Date(t.dataVencimento)
        : new Date(t.data);

      // Saldo Anterior
      if (t.status === "PAGO" && dataEfetiva < startOfCompetencia) {
        if (t.tipo === "ENTRADA") saldoAnterior += t.valor;
        else saldoAnterior -= t.valor;
      }

      // Mês Atual
      if (
        dataCompetencia >= startOfCompetencia &&
        dataCompetencia <= endOfCompetencia
      ) {
        let pass = true;
        if (
          filters.term &&
          !t.descricao.toLowerCase().includes(filters.term.toLowerCase())
        )
          pass = false;
        if (filters.status !== "TODOS") {
          const st = t.status || "PAGO";
          const normalizedStatus = st === "CONCLUIDO" ? "PAGO" : st;
          if (normalizedStatus !== filters.status) pass = false;
        }
        if (filters.tipo !== "TODOS" && t.tipo !== filters.tipo) pass = false;
        if (filters.dataIni && dataCompetencia < new Date(filters.dataIni))
          pass = false;
        if (filters.dataFim) {
          const dFim = new Date(filters.dataFim);
          dFim.setHours(23, 59, 59);
          if (dataCompetencia > dFim) pass = false;
        }

        if (pass) currentList.push(t);

        if (
          t.tipo === "ENTRADA" &&
          (t.status === "CONCLUIDO" || t.status === "PAGO" || !t.status)
        ) {
          entradasMes += t.valor;
        } else if (t.tipo === "SAIDA") {
          if (t.status === "PAGO" || t.status === "CONCLUIDO") {
            saidasMes += t.valor;
          } else {
            saidasPrevistas += t.valor;
          }
        }
      }
    }

    currentList.sort((a, b) => {
      const dA = a.dataVencimento
        ? new Date(a.dataVencimento)
        : new Date(a.data);
      const dB = b.dataVencimento
        ? new Date(b.dataVencimento)
        : new Date(b.data);
      return dB.getTime() - dA.getTime();
    });

    return {
      saldoAnterior,
      entradasMes,
      saidasMes,
      saidasPrevistas,
      saldoAtual: saldoAnterior + entradasMes - saidasMes,
      filteredList: currentList,
    };
  }, [rawExtrato, competencia, filters]);

  // --- ACTIONS ---

  const handleOpenDespesaModal = (item?: TransacaoFinanceira) => {
    if (item) {
      const normalizedStatus =
        item.status === "CONCLUIDO" ? "PAGO" : item.status || "PENDENTE";
      setEditingId(item.id);
      setFormDespesa({
        descricao: item.descricao.split(" - ")[1] || item.descricao,
        valor: item.valor,
        categoria: item.categoria || "Custo Fixo",
        status: normalizedStatus,
        dataVencimento:
          toInputDate(item.dataVencimento) || toInputDate(item.data),
        dataPagamento: toInputDate(item.dataPagamento),
        contaBancariaId: item.contaBancariaId || "",
        parcelas: 1,
      });
    } else {
      setEditingId(null);
      setFormDespesa({
        ...emptyDespesaForm,
        dataPagamento: todayInputDate(),
      });
    }
    setModalDespesaOpen(true);
  };

  const handleSaveDespesa = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (formDespesa.status === "PAGO") {
        if (!formDespesa.dataPagamento)
          throw new Error("Informe a data de pagamento/compra.");
        if (!formDespesa.contaBancariaId && formDespesa.contaBancariaId !== "")
          throw new Error("Selecione a conta de saída.");
      }
      if (editingId) await adminApi.updateDespesa(editingId, formDespesa);
      else await adminApi.createDespesa(formDespesa);
      setModalDespesaOpen(false);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleOpenPayment = (item: TransacaoFinanceira) => {
    setPaymentForm({
      id: item.id,
      descricao: item.descricao,
      valorOriginal: item.valor,
      valorPago: item.valor,
      dataPagamento: todayInputDate(),
      contaBancariaId: "",
    });
    setPaymentModalOpen(true);
  };

  const handleConfirmPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!paymentForm.contaBancariaId && paymentForm.contaBancariaId !== "")
      return alert("Selecione a conta de saída.");
    try {
      await adminApi.updateDespesa(paymentForm.id, {
        status: "PAGO",
        dataPagamento: paymentForm.dataPagamento,
        contaBancariaId: paymentForm.contaBancariaId,
        valor: paymentForm.valorPago,
        descricao: paymentForm.descricao,
        categoria: "",
        dataVencimento: "",
      } as any);
      setPaymentModalOpen(false);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const requestDelete = (id: string) => {
    setConfirmModal({
      open: true,
      title: "Excluir registro?",
      onConfirm: async () => {
        try {
          await adminApi.deleteDespesa(id);
          loadData();
          setConfirmModal((prev) => ({ ...prev, open: false }));
        } catch (e: any) {
          alert(e.message);
        }
      },
    });
  };

  const handlePayInvoice = () => {
    if (!selectedConta || !extratoContaData) return;
    setFormDespesa({
      ...emptyDespesaForm,
      descricao: `Pagamento Fatura ${selectedConta.nome} - ${new Date(extratoPeriod.ano, extratoPeriod.mes - 1).toLocaleString("pt-BR", { month: "long" })}`,
      valor: extratoContaData.total,
      status: "PAGO",
      categoria: "Custo Fixo",
      dataVencimento: todayInputDate(),
      dataPagamento: todayInputDate(),
      contaBancariaId: "CAIXA",
    });
    setEditingId(null);
    setExtratoModalOpen(false);
    setContasModalOpen(false);
    setModalDespesaOpen(true);
  };

  const openContasModal = async () => {
    try {
      setContas(await adminApi.getContas({ tipo_uso: "PAGAMENTO" }));
      setContasModalOpen(true);
      setShowNewContaForm(false);
    } catch (e) {}
  };
  const handleCreateConta = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createConta({ ...newContaForm, tipoUso: "PAGAMENTO" });
      setNewContaForm({
        nome: "",
        tipo: "Pix/Débito",
        nomeAportador: "",
        diaFechamento: "",
        diaVencimento: "",
      });
      setShowNewContaForm(false);
      setContas(await adminApi.getContas({ tipo_uso: "PAGAMENTO" }));
    } catch (e: any) {
      alert(e.message);
    }
  };
  const handleToggleContaStatus = async (c: ContaBancaria) => {
    try {
      await adminApi.updateConta(c.id, { ativa: !c.ativa });
      setContas(await adminApi.getContas({ tipo_uso: "PAGAMENTO" }));
    } catch (e: any) {}
  };
  const handleDeleteConta = async (id: string) => {
    setConfirmModal({
      open: true,
      title: "Excluir conta?",
      onConfirm: async () => {
        try {
          await adminApi.deleteConta(id);
          setContas(await adminApi.getContas({ tipo_uso: "PAGAMENTO" }));
          setConfirmModal((p) => ({ ...p, open: false }));
        } catch (e: any) {
          alert(e.message);
          setConfirmModal((p) => ({ ...p, open: false }));
        }
      },
    });
  };
  const openExtratoConta = async (c: ContaBancaria) => {
    setSelectedConta(c);
    setExtratoPeriod({
      mes: new Date().getMonth() + 1,
      ano: new Date().getFullYear(),
    });
    await fetchExtratoConta(
      c.id,
      new Date().getMonth() + 1,
      new Date().getFullYear(),
    );
    setPagarAporteForm({
      valor: 0,
      dataPagamento: todayInputDate(),
      contaPagamentoId: "CAIXA",
      descricao: "",
    });
    setExtratoModalOpen(true);
  };
  const fetchExtratoConta = async (id: string, m: number, a: number) => {
    try {
      setExtratoContaData(await adminApi.getExtratoConta(id, m, a));
    } catch (e) {}
  };
  useEffect(() => {
    if (extratoModalOpen && selectedConta)
      fetchExtratoConta(selectedConta.id, extratoPeriod.mes, extratoPeriod.ano);
  }, [extratoPeriod]);
  const handleOpenQuickEdit = (item: ExtratoItem) => {
    setQuickEditModal({ open: true, item });
    setQuickForm({ descricao: item.descricao, valor: item.valor });
  };
  const handleSaveQuickEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!quickEditModal.item) return;
    try {
      await adminApi.updateDespesa(quickEditModal.item.id, {
        ...quickEditModal.item,
        descricao: quickForm.descricao,
        valor: quickForm.valor,
      } as any);
      if (selectedConta)
        await fetchExtratoConta(
          selectedConta.id,
          extratoPeriod.mes,
          extratoPeriod.ano,
        );
      setQuickEditModal({ open: false, item: null });
      if (/\(\d+\/\d+\)/.test(quickForm.descricao)) setParcelaWarningOpen(true);
    } catch (e: any) {
      alert(e.message);
    }
  };
  const handleDeleteInvoiceItem = (id: string, desc: string) => {
    if (!confirm("Remover item?")) return;
    adminApi
      .deleteDespesa(id)
      .then(async () => {
        if (selectedConta)
          await fetchExtratoConta(
            selectedConta.id,
            extratoPeriod.mes,
            extratoPeriod.ano,
          );
        if (/\(\d+\/\d+\)/.test(desc)) setParcelaWarningOpen(true);
      })
      .catch((e: any) => alert(e.message));
  };

  const handleDeleteAportePagamento = async (item: ExtratoItem) => {
    if (item.tipo !== "SAIDA") return;
    if (!confirm("Excluir este pagamento de aporte?")) return;
    try {
      await adminApi.deleteAporteMovimento(item.id);
      if (selectedConta) {
        await fetchExtratoConta(
          selectedConta.id,
          extratoPeriod.mes,
          extratoPeriod.ano,
        );
      }
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const isContaAporte = selectedConta?.tipo === "Aporte";
  const saldoAporteAcumulado =
    extratoContaData?.totalAcumulado ?? extratoContaData?.total ?? 0;

  const handleOpenPagarAporte = () => {
    setPagarAporteForm({
      valor: saldoAporteAcumulado > 0 ? saldoAporteAcumulado : 0,
      dataPagamento: todayInputDate(),
      contaPagamentoId: "CAIXA",
      descricao: "",
    });
    setPagarAporteModalOpen(true);
  };

  const handleConfirmPagarAporte = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedConta) return;
    if (!pagarAporteForm.contaPagamentoId) {
      alert("Selecione a conta de pagamento.");
      return;
    }
    if (pagarAporteForm.valor <= 0) {
      alert("Informe um valor maior que zero.");
      return;
    }
    try {
      await adminApi.pagarAporteConta(selectedConta.id, pagarAporteForm);
      setPagarAporteModalOpen(false);
      await fetchExtratoConta(
        selectedConta.id,
        extratoPeriod.mes,
        extratoPeriod.ano,
      );
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const openContabilidadeModal = () => {
    const [anoStr, mesStr] = String(competencia || "").split("-");
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    const hasValidCompetencia = Number.isFinite(ano) && Number.isFinite(mes);
    const lastDay = hasValidCompetencia
      ? new Date(ano, mes, 0).getDate()
      : new Date().getDate();

    const dataIni = hasValidCompetencia
      ? `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-01`
      : `${todayInputDate().slice(0, 7)}-01`;
    const dataFim = hasValidCompetencia
      ? `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
      : todayInputDate();

    setContabilidadeFiltros({
      tipo: "ENTRADA",
      dataIni,
      dataFim,
    });
    setContabilidadeNotas([]);
    setContabilidadeError("");
    setContabilidadeModalOpen(true);
  };

  const handleBuscarNotasContabilidade = async () => {
    if (!contabilidadeFiltros.dataIni || !contabilidadeFiltros.dataFim) {
      setContabilidadeError("Informe a data inicial e final.");
      return;
    }
    if (contabilidadeFiltros.dataIni > contabilidadeFiltros.dataFim) {
      setContabilidadeError("A data inicial não pode ser maior que a data final.");
      return;
    }

    try {
      setLoadingContabilidadeNotas(true);
      setContabilidadeError("");
      const result = await adminApi.getNotasContabilidade(contabilidadeFiltros);
      setContabilidadeNotas(result.items || []);
    } catch (e: any) {
      setContabilidadeNotas([]);
      setContabilidadeError(e.message || "Falha ao buscar notas.");
    } finally {
      setLoadingContabilidadeNotas(false);
    }
  };

  const handleExportarNotasContabilidade = async () => {
    if (contabilidadeNotas.length === 0) {
      alert("Busque as notas do período antes de exportar o ZIP.");
      return;
    }

    try {
      setExportingContabilidadeZip(true);
      const { blob, filename } = await adminApi.exportarNotasContabilidadeZip(
        contabilidadeFiltros,
      );
      const downloadName =
        filename ||
        `xml-contabilidade-${contabilidadeFiltros.tipo.toLowerCase()}-${contabilidadeFiltros.dataIni}_a_${contabilidadeFiltros.dataFim}.zip`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || "Falha ao exportar ZIP dos XMLs.");
    } finally {
      setExportingContabilidadeZip(false);
    }
  };

  const selectedContaObj = contas.find(
    (c) => c.id === formDespesa.contaBancariaId,
  );
  const isCredito = selectedContaObj?.tipo === "Crédito";

  // --- RENDER ---
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* HEADER PERSONALIZADO (Substitui o Header Global) */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-slate-800">Fluxo de Caixa</h1>
          <div className="h-8 w-px bg-slate-200"></div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wide">
              Competência
            </span>
            <input
              type="month"
              className="p-1.5 text-base font-bold text-slate-700 outline-none border border-slate-200 rounded-lg hover:border-slate-300 focus:border-indigo-500 bg-white"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={openContasModal}
            className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-lg font-bold flex gap-2 text-sm shadow-lg shadow-slate-900/10 transition-all active:scale-95"
          >
            <Icons.Cash /> Contas
          </button>
          <button
            onClick={openContabilidadeModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold flex gap-2 text-sm shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
          >
            <Icons.Receipt /> Contabilidade
          </button>
          <button
            onClick={() => handleOpenDespesaModal()}
            className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-lg font-bold flex gap-2 text-sm shadow-lg shadow-rose-600/20 transition-all active:scale-95"
          >
            <Icons.Plus /> Lançamento
          </button>
        </div>
      </div>

      <div className="p-8 space-y-6 max-w-screen-2xl mx-auto w-full animate-fadeIn">
        {/* KPI CARDS (Unchanged) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-10">
              <Icons.History />
            </div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Saldo Anterior (Acumulado)
            </div>
            <div
              className={`text-2xl font-bold mt-1 ${dashboardData.saldoAnterior >= 0 ? "text-slate-700" : "text-rose-600"}`}
            >
              {formatMoney(dashboardData.saldoAnterior)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Até o mês passado
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-10 text-emerald-600">
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 11l5-5m0 0l5 5m-5-5v12"
                />
              </svg>
            </div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Entradas (Realizadas)
            </div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">
              {formatMoney(dashboardData.entradasMes)}
            </div>
            <div className="text-[10px] text-emerald-600/60 mt-1">
              Vendas e Recebimentos
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-10 text-rose-600">
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 13l-5 5m0 0l-5-5m5 5V6"
                />
              </svg>
            </div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Saídas (Realizadas)
            </div>
            <div className="text-2xl font-bold text-rose-600 mt-1">
              {formatMoney(dashboardData.saidasMes)}
            </div>
            {dashboardData.saidasPrevistas > 0 && (
              <div className="text-[10px] font-bold text-orange-500 mt-1 flex items-center gap-1">
                <span>
                  + {formatMoney(dashboardData.saidasPrevistas)} Pendentes
                </span>
              </div>
            )}
          </div>
          <div className="bg-slate-900 p-5 rounded-xl shadow-lg border border-slate-800 text-white relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-indigo-500 rounded-full blur-3xl opacity-20"></div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Saldo Atual (Caixa Real)
            </div>
            <div
              className={`text-2xl font-bold mt-1 ${dashboardData.saldoAtual >= 0 ? "text-indigo-400" : "text-rose-400"}`}
            >
              {formatMoney(dashboardData.saldoAtual)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Anterior + (Entradas - Saídas)
            </div>
          </div>
        </div>

        {/* FILTROS (Unchanged) */}
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* ... Filters UI ... */}
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
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="Buscar por descrição..."
              value={filters.term}
              onChange={(e) => setFilters({ ...filters, term: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <select
              className="w-full p-2 text-sm border rounded-md bg-white text-slate-600 font-medium"
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="TODOS">Status: Todos</option>
              <option value="PAGO">✅ Realizados</option>
              <option value="PENDENTE">🕒 Pendentes</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <select
              className="w-full p-2 text-sm border rounded-md bg-white text-slate-600 font-medium"
              value={filters.tipo}
              onChange={(e) => setFilters({ ...filters, tipo: e.target.value })}
            >
              <option value="TODOS">Tipo: Todos</option>
              <option value="ENTRADA">Entradas</option>
              <option value="SAIDA">Saídas</option>
            </select>
          </div>
          <div className="md:col-span-4 flex items-center gap-2">
            <input
              type="date"
              className="w-full p-2 text-xs border rounded-md text-slate-600"
              value={filters.dataIni}
              onChange={(e) =>
                setFilters({ ...filters, dataIni: e.target.value })
              }
            />
            <span className="text-slate-400 text-xs">até</span>
            <input
              type="date"
              className="w-full p-2 text-xs border rounded-md text-slate-600"
              value={filters.dataFim}
              onChange={(e) =>
                setFilters({ ...filters, dataFim: e.target.value })
              }
            />
          </div>
        </div>

        <Table
          headers={[
            "Vencimento",
            "Pagamento",
            "Tipo",
            "Descrição",
            "Status",
            "Valor",
            "Ações",
          ]}
        >
          {dashboardData.filteredList.map((t) => {
            const isPending = t.status === "PENDENTE";
            return (
              <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-slate-600 font-medium">
                  {t.dataVencimento
                    ? formatDateOnly(t.dataVencimento)
                    : formatDateOnly(t.data)}
                </td>
                <td className="px-6 py-4 font-mono text-xs text-slate-500">
                  {t.dataPagamento ? formatDateOnly(t.dataPagamento) : "-"}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${t.tipo === "ENTRADA" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                  >
                    {t.origem}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-slate-700">
                  {t.descricao}
                </td>
                <td className="px-6 py-4">
                  {t.tipo === "SAIDA" ? (
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${isPending ? "bg-yellow-50 text-yellow-700 border-yellow-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
                    >
                      {t.status || "PAGO"}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-600">
                      {t.status || "CONCLUIDO"}
                    </span>
                  )}
                </td>
                <td
                  className={`px-6 py-4 font-bold ${t.tipo === "ENTRADA" ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {t.tipo === "SAIDA" ? "-" : "+"}
                  {formatMoney(t.valor)}
                </td>
                <td className="px-6 py-4 flex gap-2">
                  {t.tipo === "SAIDA" && (
                    <>
                      {isPending && (
                        <button
                          onClick={() => handleOpenPayment(t)}
                          className="text-emerald-600 hover:bg-emerald-50 p-2 rounded transition-colors"
                          title="Pagar (Baixa Rápida)"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </button>
                      )}
                      {!t.isFatura && (
                        <>
                          <button
                            onClick={() => handleOpenDespesaModal(t)}
                            className="text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded"
                            title="Editar Detalhes"
                          >
                            <Icons.Edit />
                          </button>
                          <button
                            onClick={() => requestDelete(t.id)}
                            className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded"
                            title="Excluir"
                          >
                            <Icons.Trash />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </div>

      <Modal
        open={contabilidadeModalOpen}
        title="Exportar XML para Contabilidade"
        onClose={() => setContabilidadeModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Tipo
              </label>
              <select
                className="w-full p-2.5 border rounded-lg bg-white"
                value={contabilidadeFiltros.tipo}
                onChange={(e) =>
                  setContabilidadeFiltros((prev) => ({
                    ...prev,
                    tipo: e.target.value as ContabilidadeTipo,
                  }))
                }
              >
                <option value="ENTRADA">Entradas (Compras)</option>
                <option value="SAIDA">Saídas (Vendas)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Data Inicial
              </label>
              <input
                type="date"
                className="w-full p-2.5 border rounded-lg"
                value={contabilidadeFiltros.dataIni}
                onChange={(e) =>
                  setContabilidadeFiltros((prev) => ({
                    ...prev,
                    dataIni: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Data Final
              </label>
              <input
                type="date"
                className="w-full p-2.5 border rounded-lg"
                value={contabilidadeFiltros.dataFim}
                onChange={(e) =>
                  setContabilidadeFiltros((prev) => ({
                    ...prev,
                    dataFim: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-xs text-slate-600 font-medium">
              {contabilidadeNotas.length} nota(s) encontrada(s) para exportação
            </div>
            <button
              type="button"
              onClick={handleBuscarNotasContabilidade}
              disabled={loadingContabilidadeNotas}
              className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-xs font-bold"
            >
              {loadingContabilidadeNotas ? "Buscando..." : "Buscar Notas"}
            </button>
          </div>

          {contabilidadeError && (
            <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-lg p-3 text-sm">
              {contabilidadeError}
            </div>
          )}

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-500 uppercase text-[10px] tracking-wide">
                  <tr>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Documento</th>
                    <th className="p-2 text-left">Origem</th>
                    <th className="p-2 text-left">Código</th>
                    <th className="p-2 text-left">Chave</th>
                  </tr>
                </thead>
                <tbody>
                  {contabilidadeNotas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-4 text-center text-slate-400 text-xs"
                      >
                        Nenhuma nota listada.
                      </td>
                    </tr>
                  ) : (
                    contabilidadeNotas.map((nota) => (
                      <tr
                        key={`${nota.id}-${nota.origem}`}
                        className="border-t border-slate-100"
                      >
                        <td className="p-2 text-xs text-slate-600 font-mono">
                          {formatDateOnly(nota.data)}
                        </td>
                        <td className="p-2 text-xs font-bold text-slate-700">
                          {nota.documento}
                        </td>
                        <td className="p-2 text-xs text-slate-600">
                          {nota.origem}
                        </td>
                        <td className="p-2 text-xs text-slate-700 font-mono">
                          {nota.codigo}
                        </td>
                        <td className="p-2 text-xs text-slate-500 font-mono">
                          {nota.chaveAcesso || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportarNotasContabilidade}
            disabled={contabilidadeNotas.length === 0 || exportingContabilidadeZip}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold"
          >
            {exportingContabilidadeZip
              ? "Gerando ZIP..."
              : "Baixar XMLs (.zip)"}
          </button>
        </div>
      </Modal>

      {/* MODAL EDITAR / NOVO (CRUD COMPLETO) */}
      <Modal
        open={modalDespesaOpen}
        title={editingId ? "Editar Lançamento" : "Nova Despesa"}
        onClose={() => setModalDespesaOpen(false)}
      >
        <form className="space-y-4" onSubmit={handleSaveDespesa}>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Descrição
            </label>
            <input
              className="w-full p-2 border rounded"
              required
              placeholder="Ex: Conta de Luz"
              value={formDespesa.descricao}
              onChange={(e) =>
                setFormDespesa({ ...formDespesa, descricao: e.target.value })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Valor Total (R$)
              </label>
              <CurrencyInput
                className="w-full p-2 border rounded font-mono font-bold text-rose-600 pl-8"
                value={formDespesa.valor}
                onChange={(val) =>
                  setFormDespesa({ ...formDespesa, valor: val })
                }
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Categoria
              </label>
              <select
                className="w-full p-2 border rounded bg-white"
                value={formDespesa.categoria}
                onChange={(e) =>
                  setFormDespesa({ ...formDespesa, categoria: e.target.value })
                }
              >
                <option>Custo Fixo</option>
                <option>Manutenção</option>
                <option>Aluguel</option>
                <option>Funcionários</option>
                <option>Impostos</option>
                <option>Outros</option>
              </select>
            </div>
          </div>

          {/* Status Selector - Unchanged logic */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Status / Meio de Pagamento
            </label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="PENDENTE"
                  checked={formDespesa.status === "PENDENTE"}
                  onChange={() =>
                    setFormDespesa({
                      ...formDespesa,
                      status: "PENDENTE",
                      dataPagamento: "",
                      contaBancariaId: "",
                    })
                  }
                  className="accent-rose-600"
                />
                <span className="text-sm font-medium text-slate-700">
                  Pendente (A Pagar)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="PAGO"
                  checked={formDespesa.status === "PAGO"}
                  onChange={() =>
                    setFormDespesa({ ...formDespesa, status: "PAGO" })
                  }
                  className="accent-emerald-600"
                />
                <span className="text-sm font-medium text-slate-700">
                  Pago / Cartão
                </span>
              </label>
            </div>
          </div>

          {/* Dynamic Fields */}
          {formDespesa.status === "PAGO" && (
            <div className="animate-fadeIn">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Conta de Saída / Cartão <span className="text-rose-500">*</span>
              </label>
              <select
                required
                className="w-full p-2 border rounded bg-white mb-3"
                value={formDespesa.contaBancariaId}
                onChange={(e) =>
                  setFormDespesa({
                    ...formDespesa,
                    contaBancariaId: e.target.value,
                  })
                }
              >
                <option value="">Selecione a conta...</option>
                <option value="CAIXA">💵 Dinheiro do Caixa</option>
                {contas
                  .filter(
                    (c) => c.ativa || c.id === formDespesa.contaBancariaId,
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      🏦 {c.nome} ({c.tipo}
                      {c.tipo === "Aporte" && c.nomeAportador
                        ? ` - ${c.nomeAportador}`
                        : ""}
                      )
                    </option>
                  ))}
              </select>
            </div>
          )}

          {isCredito ? (
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 animate-fadeIn space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-indigo-800 uppercase">
                  Pagamento com Crédito
                </h4>
                <span className="text-[10px] text-indigo-500 font-bold">
                  Cobrança na Fatura
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Data da Compra
                  </label>
                  <input
                    type="date"
                    required
                    max={todayInputDate()}
                    className="w-full p-2 border rounded bg-white text-sm"
                    value={formDespesa.dataPagamento}
                    onChange={(e) =>
                      setFormDespesa({
                        ...formDespesa,
                        dataPagamento: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Parcelamento
                  </label>
                  <select
                    className="w-full p-2 border rounded bg-white text-sm"
                    value={formDespesa.parcelas}
                    onChange={(e) =>
                      setFormDespesa({
                        ...formDespesa,
                        parcelas: parseInt(e.target.value),
                      })
                    }
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((p) => (
                      <option key={p} value={p}>
                        {p}x {formatMoney(formDespesa.valor / p)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100 animate-fadeIn">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Vencimento <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  className="w-full p-2 border rounded text-sm"
                  value={formDespesa.dataVencimento}
                  onChange={(e) =>
                    setFormDespesa({
                      ...formDespesa,
                      dataVencimento: e.target.value,
                    })
                  }
                />
              </div>
              {formDespesa.status === "PAGO" && (
                <div className="animate-fadeIn">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Pagamento <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    max={todayInputDate()}
                    className="w-full p-2 border rounded text-sm"
                    value={formDespesa.dataPagamento}
                    onChange={(e) =>
                      setFormDespesa({
                        ...formDespesa,
                        dataPagamento: e.target.value,
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}
          <button className="w-full bg-rose-600 text-white py-3 rounded-lg font-bold hover:bg-rose-700 mt-2">
            {formDespesa.status === "PAGO"
              ? "Salvar Pagamento"
              : "Salvar Previsão"}
          </button>
        </form>
      </Modal>

      {/* MODAL BAIXA RÁPIDA (PAYMENT) */}
      <Modal
        open={paymentModalOpen}
        title="Confirmar Pagamento"
        onClose={() => setPaymentModalOpen(false)}
      >
        <form onSubmit={handleConfirmPayment} className="space-y-6">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
            <div className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-1">
              Referente a
            </div>
            <div className="text-lg font-bold text-slate-800">
              {paymentForm.descricao}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Data do Pagamento
              </label>
              <input
                type="date"
                required
                max={todayInputDate()}
                className="w-full p-3 border rounded-lg bg-white"
                value={paymentForm.dataPagamento}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    dataPagamento: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Valor Pago (R$)
              </label>
              <CurrencyInput
                className="w-full p-3 border rounded-lg font-bold text-rose-600 pl-8"
                value={paymentForm.valorPago}
                onChange={(val) =>
                  setPaymentForm({ ...paymentForm, valorPago: val })
                }
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Conta de Saída <span className="text-rose-500">*</span>
            </label>
            <select
              required
              className="w-full p-3 border rounded-lg bg-white shadow-sm"
              value={paymentForm.contaBancariaId}
              onChange={(e) =>
                setPaymentForm({
                  ...paymentForm,
                  contaBancariaId: e.target.value,
                })
              }
            >
              <option value="">Selecione de onde saiu o dinheiro...</option>
              <option value="CAIXA">💵 Dinheiro do Caixa</option>
              {contas
                .filter((c) => c.ativa && c.tipo !== "Crédito")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    🏦 {c.nome} ({c.tipo}
                    {c.tipo === "Aporte" && c.nomeAportador
                      ? ` - ${c.nomeAportador}`
                      : ""}
                    )
                  </option>
                ))}
            </select>
          </div>

          <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-emerald-500/20 flex justify-center items-center gap-2">
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Confirmar Pagamento
          </button>
        </form>
      </Modal>

      {/* MODAL GERENCIAR CONTAS (Apenas PAGAMENTO) */}
      <Modal
        open={contasModalOpen}
        title="Gerenciar Contas de Pagamento"
        onClose={() => setContasModalOpen(false)}
      >
        {/* ... (Conteúdo de Contas inalterado, pois não usa inputs monetários) ... */}
        {/* Para brevidade, mantendo o bloco existente de gerenciamento de contas */}
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-sm text-slate-600">
              Contas utilizadas para pagar despesas (incluindo Aporte).
            </span>
            {!showNewContaForm && (
              <button
                onClick={() => setShowNewContaForm(true)}
                className="bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded hover:bg-indigo-700 flex items-center gap-1"
              >
                <Icons.Plus /> Incluir Conta
              </button>
            )}
          </div>

          {showNewContaForm && (
            <form
              onSubmit={handleCreateConta}
              className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl space-y-3 animate-fadeIn"
            >
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-indigo-800 uppercase">
                  Nova Conta
                </h4>
                <button
                  type="button"
                  onClick={() => setShowNewContaForm(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="w-full p-2 text-sm border rounded"
                  placeholder="Nome do Banco (Ex: Nubank)"
                  required
                  value={newContaForm.nome}
                  onChange={(e) =>
                    setNewContaForm({ ...newContaForm, nome: e.target.value })
                  }
                />
                <select
                  className="w-full p-2 text-sm border rounded bg-white"
                  value={newContaForm.tipo}
                  onChange={(e) =>
                    setNewContaForm({ ...newContaForm, tipo: e.target.value })
                  }
                >
                  <option>Pix/Débito</option>
                  <option>Crédito</option>
                  <option>Aporte</option>
                </select>
              </div>
              {newContaForm.tipo === "Aporte" && (
                <div className="animate-fadeIn">
                  <label className="text-[10px] font-bold text-indigo-800 uppercase">
                    Nome do Aportador
                  </label>
                  <input
                    className="w-full p-2 text-sm border rounded"
                    required
                    placeholder="Ex: João da Silva"
                    value={newContaForm.nomeAportador}
                    onChange={(e) =>
                      setNewContaForm({
                        ...newContaForm,
                        nomeAportador: e.target.value,
                      })
                    }
                  />
                </div>
              )}
              {newContaForm.tipo === "Crédito" && (
                <div className="grid grid-cols-2 gap-3 animate-fadeIn">
                  <div>
                    <label className="text-[10px] font-bold text-indigo-800 uppercase">
                      Dia Fechamento
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className="w-full p-2 text-sm border rounded"
                      required
                      placeholder="Ex: 5"
                      value={newContaForm.diaFechamento}
                      onChange={(e) =>
                        setNewContaForm({
                          ...newContaForm,
                          diaFechamento: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-indigo-800 uppercase">
                      Dia Vencimento
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className="w-full p-2 text-sm border rounded"
                      required
                      placeholder="Ex: 10"
                      value={newContaForm.diaVencimento}
                      onChange={(e) =>
                        setNewContaForm({
                          ...newContaForm,
                          diaVencimento: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              )}
              <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2 rounded">
                Salvar Conta
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contas.length === 0 ? (
              <p className="col-span-2 text-center text-slate-400 py-8">
                Nenhuma conta de pagamento cadastrada.
              </p>
            ) : (
              contas.map((c) => (
                <div
                  key={c.id}
                  className={`p-4 border rounded-xl shadow-sm hover:shadow-md transition-all relative group ${!c.ativa ? "opacity-50 grayscale bg-slate-100" : "bg-white"}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-800">{c.nome}</h4>
                        {!c.ativa && (
                          <span className="text-[9px] bg-slate-600 text-white px-1 rounded uppercase">
                            Inativa
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${c.tipo === "Crédito" ? "bg-purple-100 text-purple-700" : c.tipo === "Aporte" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                      >
                        {c.tipo}
                      </span>
                      {c.tipo === "Crédito" && (
                        <div className="text-[10px] text-slate-500 mt-1">
                          Fecha dia {c.diaFechamento} • Vence dia{" "}
                          {c.diaVencimento}
                        </div>
                      )}
                      {c.tipo === "Aporte" && c.nomeAportador && (
                        <div className="text-[10px] text-slate-500 mt-1">
                          Aportador: {c.nomeAportador}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 items-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleToggleContaStatus(c)}
                        className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${c.ativa ? "border-slate-300 text-slate-500 hover:bg-slate-100" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50"}`}
                        title={c.ativa ? "Desativar conta" : "Reativar conta"}
                      >
                        {c.ativa ? "Arquivar" : "Ativar"}
                      </button>
                      <button
                        onClick={() => handleDeleteConta(c.id)}
                        className="text-slate-300 hover:text-rose-500"
                      >
                        <Icons.Trash />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => openExtratoConta(c)}
                    className="w-full mt-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-2 rounded border border-indigo-200"
                  >
                    Ver Extrato
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL EXTRATO CONTA e QUICK EDIT (Unchanged but ensuring imports) */}
      {selectedConta && (
        <Modal
          open={extratoModalOpen}
          title={`Extrato: ${selectedConta.nome}`}
          onClose={() => setExtratoModalOpen(false)}
        >
          <div className="space-y-6">
            {/* ... Extrato content same as before ... */}
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex gap-2 items-center">
                <select
                  className="p-2 border rounded text-sm font-bold text-slate-700 bg-white"
                  value={extratoPeriod.mes}
                  onChange={(e) =>
                    setExtratoPeriod({
                      ...extratoPeriod,
                      mes: parseInt(e.target.value),
                    })
                  }
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(0, m - 1).toLocaleString("pt-BR", {
                        month: "long",
                      })}
                    </option>
                  ))}
                </select>
                <select
                  className="p-2 border rounded text-sm font-bold text-slate-700 bg-white"
                  value={extratoPeriod.ano}
                  onChange={(e) =>
                    setExtratoPeriod({
                      ...extratoPeriod,
                      ano: parseInt(e.target.value),
                    })
                  }
                >
                  {[2023, 2024, 2025, 2026].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase font-bold">
                  {selectedConta.tipo === "Aporte"
                    ? "Saldo Acumulado"
                    : selectedConta.tipo === "Crédito"
                    ? "Total da Fatura"
                    : "Total Pago no Período"}
                </div>
                <div
                  className={`text-2xl font-bold ${selectedConta.tipo === "Aporte" ? "text-amber-600" : "text-rose-600"}`}
                >
                  {formatMoney(
                    selectedConta.tipo === "Aporte"
                      ? saldoAporteAcumulado
                      : extratoContaData?.total || 0,
                  )}
                </div>
              </div>
            </div>
            {isContaAporte && saldoAporteAcumulado > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={handleOpenPagarAporte}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg shadow-amber-500/30"
                >
                  Pagar Aporte
                </button>
              </div>
            )}
            {selectedConta.tipo === "Crédito" &&
              (extratoContaData?.total || 0) > 0 && (
                <div className="flex justify-end items-center gap-3">
                  {(() => {
                    const closingDate = selectedConta.diaFechamento
                      ? new Date(
                          extratoPeriod.ano,
                          extratoPeriod.mes - 1,
                          selectedConta.diaFechamento,
                        )
                      : new Date();
                    const isClosed = new Date() >= closingDate;
                    if (!isClosed)
                      return (
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                          Fatura em Aberto (Fecha dia{" "}
                          {selectedConta.diaFechamento})
                        </span>
                      );
                    return (
                      <button
                        onClick={handlePayInvoice}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg shadow-emerald-500/30 flex items-center gap-2"
                      >
                        Realizar Pagamento da Fatura
                      </button>
                    );
                  })()}
                </div>
              )}
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-xs">
                  <tr>
                    <th className="p-3">Data</th>
                    <th className="p-3">Descrição</th>
                    <th className="p-3 text-right">Valor</th>
                    {(selectedConta.tipo === "Crédito" ||
                      selectedConta.tipo === "Aporte") && (
                      <th className="p-3 text-center">Ações</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!extratoContaData?.itens ||
                  extratoContaData.itens.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          selectedConta.tipo === "Crédito" ||
                          selectedConta.tipo === "Aporte"
                            ? 4
                            : 3
                        }
                        className="p-6 text-center text-slate-400"
                      >
                        Nenhum registro encontrado neste período.
                      </td>
                    </tr>
                  ) : (
                    extratoContaData.itens.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-500 text-xs">
                          {formatDateOnly(item.data)}
                        </td>
                        <td className="p-3 font-medium text-slate-700">
                          {item.descricao}
                        </td>
                        <td
                          className={`p-3 text-right font-bold ${isContaAporte ? item.tipo === "ENTRADA" ? "text-amber-700" : "text-emerald-700" : "text-rose-600"}`}
                        >
                          {isContaAporte
                            ? item.tipo === "ENTRADA"
                              ? "+"
                              : "-"
                            : "-"}
                          {formatMoney(item.valor)}
                        </td>
                        {selectedConta.tipo === "Crédito" && (
                          <td className="p-3 flex justify-center gap-2">
                            <button
                              onClick={() => handleOpenQuickEdit(item)}
                              className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded transition-colors"
                              title="Editar este lançamento"
                            >
                              <Icons.Edit />
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteInvoiceItem(item.id, item.descricao)
                              }
                              className="text-rose-500 hover:bg-rose-50 p-1.5 rounded transition-colors"
                              title="Remover da fatura"
                            >
                              <Icons.Trash />
                            </button>
                          </td>
                        )}
                        {selectedConta.tipo === "Aporte" && (
                          <td className="p-3 flex justify-center gap-2">
                            {item.tipo === "SAIDA" ? (
                              <button
                                onClick={() => handleDeleteAportePagamento(item)}
                                className="text-rose-500 hover:bg-rose-50 p-1.5 rounded transition-colors"
                                title="Remover pagamento de aporte"
                              >
                                <Icons.Trash />
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400">-</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        open={pagarAporteModalOpen}
        title={`Pagar Aporte${selectedConta ? ` - ${selectedConta.nome}` : ""}`}
        onClose={() => setPagarAporteModalOpen(false)}
      >
        <form onSubmit={handleConfirmPagarAporte} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
            <div className="text-xs font-bold text-amber-800 uppercase">
              Saldo acumulado atual
            </div>
            <div className="text-xl font-bold text-amber-700">
              {formatMoney(saldoAporteAcumulado)}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Data do Pagamento
            </label>
            <input
              type="date"
              required
              max={todayInputDate()}
              className="w-full p-2 border rounded text-sm"
              value={pagarAporteForm.dataPagamento}
              onChange={(e) =>
                setPagarAporteForm({
                  ...pagarAporteForm,
                  dataPagamento: e.target.value,
                })
              }
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Valor a Pagar (R$)
            </label>
            <CurrencyInput
              className="w-full p-2 border rounded text-sm pl-8"
              value={pagarAporteForm.valor}
              onChange={(valor) =>
                setPagarAporteForm({ ...pagarAporteForm, valor })
              }
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Conta de Pagamento
            </label>
            <select
              required
              className="w-full p-2 border rounded text-sm bg-white"
              value={pagarAporteForm.contaPagamentoId}
              onChange={(e) =>
                setPagarAporteForm({
                  ...pagarAporteForm,
                  contaPagamentoId: e.target.value,
                })
              }
            >
              <option value="CAIXA">💵 Dinheiro do Caixa</option>
              {contas
                .filter(
                  (c) =>
                    c.ativa &&
                    c.tipo !== "Aporte" &&
                    c.id !== selectedConta?.id,
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    🏦 {c.nome} ({c.tipo})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Descrição (Opcional)
            </label>
            <input
              className="w-full p-2 border rounded text-sm"
              placeholder="Ex: Pagamento parcial do aporte"
              value={pagarAporteForm.descricao}
              onChange={(e) =>
                setPagarAporteForm({
                  ...pagarAporteForm,
                  descricao: e.target.value,
                })
              }
            />
          </div>
          <button className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-lg font-bold">
            Confirmar Pagamento de Aporte
          </button>
        </form>
      </Modal>

      {/* QUICK EDIT MODAL */}
      <Modal
        open={quickEditModal.open}
        title="Edição Rápida de Fatura"
        onClose={() => setQuickEditModal({ open: false, item: null })}
      >
        <form onSubmit={handleSaveQuickEdit} className="space-y-5">
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-800">
            <strong>Atenção:</strong> Você está editando um item da fatura de{" "}
            <strong>{selectedConta?.nome}</strong>. A data de vencimento foi
            bloqueada para manter o item nesta fatura.
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Data da Fatura (Bloqueado)
            </label>
            <input
              className="w-full p-2.5 border rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
              disabled
              value={
                quickEditModal.item?.data
                  ? formatDateOnly(quickEditModal.item.data)
                  : ""
              }
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Descrição
            </label>
            <input
              className="w-full p-2.5 border rounded-lg"
              required
              value={quickForm.descricao}
              onChange={(e) =>
                setQuickForm({ ...quickForm, descricao: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Valor (R$)
            </label>
            <CurrencyInput
              className="w-full p-2.5 border rounded-lg pl-8"
              value={quickForm.valor}
              onChange={(val) => setQuickForm({ ...quickForm, valor: val })}
            />
          </div>
          <button className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700">
            Salvar Alterações
          </button>
        </form>
      </Modal>

      {/* MODAL AVISO PARCELAS & CONFIRM - Unchanged */}
      <Modal
        open={parcelaWarningOpen}
        title="Atenção: Item Parcelado"
        onClose={() => setParcelaWarningOpen(false)}
      >
        <div className="text-center space-y-4 py-2">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h4 className="text-lg font-bold text-slate-800">
            Verifique as outras parcelas
          </h4>
          <p className="text-slate-600 text-sm leading-relaxed">
            Você alterou ou removeu um registro que parece fazer parte de um
            parcelamento. <br />
            <br />O sistema <strong>não altera automaticamente</strong> os
            outros meses. Se necessário, navegue pelas faturas dos próximos
            meses e faça os ajustes manualmente.
          </p>
          <button
            onClick={() => setParcelaWarningOpen(false)}
            className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-slate-900 w-full"
          >
            Entendi, vou verificar
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmModal.open}
        title="Confirmação"
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
      >
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">{confirmModal.title}</p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={() =>
                setConfirmModal((prev) => ({ ...prev, open: false }))
              }
              className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={confirmModal.onConfirm}
              className="px-4 py-2 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700"
            >
              Confirmar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
