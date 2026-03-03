import { FormEvent, useEffect, useState } from "react";
import { adminApi } from "../api";
import { Icons } from "../components/Icons";
import { Modal, Table } from "../components/Shared";
import { ContaBancaria, Role, SessaoCaixaAdmin } from "../types";
import { formatDate, formatMoney } from "../utils";

export function VendasTab() {
  const [sessoes, setSessoes] = useState<SessaoCaixaAdmin[]>([]);
  const [selectedSessao, setSelectedSessao] = useState<SessaoCaixaAdmin | null>(
    null,
  );
  const [userRole, setUserRole] = useState<Role>("OPERADOR");
  const isAdmin = userRole === "ADMIN";

  // States para Detalhes da Sessão
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "resumo" | "tickets" | "movimentacoes"
  >("resumo");
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [totaisPorConta, setTotaisPorConta] = useState<Record<string, any>>({});

  // States para Contas de Faturamento
  const [contasModalOpen, setContasModalOpen] = useState(false);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [newContaForm, setNewContaForm] = useState({
    nome: "",
    tipo: "Conta Pix",
  });
  const [showNewContaForm, setShowNewContaForm] = useState(false);

  // Confirm Actions
  const [adminActionModal, setAdminActionModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  // Extrato de Conta (Recebíveis)
  const [extratoModalOpen, setExtratoModalOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<ContaBancaria | null>(
    null,
  );
  const [extratoContaData, setExtratoContaData] = useState<any | null>(null);
  const [extratoPeriod, setExtratoPeriod] = useState({
    mes: new Date().getMonth() + 1,
    ano: new Date().getFullYear(),
  });

  const loadSessoes = async () => {
    try {
      const user = adminApi.getStoredUser();
      if (user) setUserRole(user.role);

      const data = await adminApi.getSessoesCaixa();
      setSessoes(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadSessoes();
  }, []);

  // --- LÓGICA DE CONTAS DE FATURAMENTO (RECEBIMENTO) ---
  const handleOpenContas = async () => {
    try {
      const data = await adminApi.getContas({ tipo_uso: "RECEBIMENTO" });
      setContas(data);
      setContasModalOpen(true);
      setShowNewContaForm(false);
    } catch (e) {
      alert("Erro ao carregar contas.");
    }
  };

  const handleCreateConta = async (e: FormEvent) => {
    e.preventDefault();
    try {
      // Cria conta com tipo RECEBIMENTO
      await adminApi.createConta({
        ...newContaForm,
        tipoUso: "RECEBIMENTO",
        diaFechamento: null,
        diaVencimento: null,
      });
      setNewContaForm({ nome: "", tipo: "Conta Pix" });
      setShowNewContaForm(false);
      const data = await adminApi.getContas({ tipo_uso: "RECEBIMENTO" });
      setContas(data);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteConta = async (id: string) => {
    if (!confirm("Tem certeza? Isso pode afetar o histórico financeiro."))
      return;
    try {
      await adminApi.deleteConta(id);
      const data = await adminApi.getContas({ tipo_uso: "RECEBIMENTO" });
      setContas(data);
    } catch (e: any) {
      alert(e.message);
    }
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
    setExtratoModalOpen(true);
  };

  const fetchExtratoConta = async (id: string, m: number, a: number) => {
    try {
      setExtratoContaData(await adminApi.getExtratoConta(id, m, a));
    } catch (e) {
      setExtratoContaData(null);
    }
  };

  // --- LÓGICA DE DETALHES DA SESSÃO ---
  const handleOpenDetails = async (id: string) => {
    setModalOpen(true);
    setLoadingDetails(true);
    setActiveTab("resumo");
    setSelectedSessao(null);
    setTotaisPorConta({});
    try {
      const details = await adminApi.getSessaoDetalhes(id);
      setSelectedSessao(details);
      if (details.totais_por_conta) {
        setTotaisPorConta(details.totais_por_conta);
      }
    } catch (e) {
      alert("Erro ao carregar detalhes da sessão");
      setModalOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  // --- ADMIN ACTIONS ---
  const handleDeleteSessao = (id: string) => {
    setAdminActionModal({
      open: true,
      title: "ATENÇÃO: Excluir Sessão de Caixa",
      message:
        "Isso apagará permanentemente todo o histórico desta sessão, incluindo todas as vendas e movimentações. O financeiro será afetado. Esta ação é irreversível.",
      onConfirm: async () => {
        try {
          await adminApi.deleteSessao(id);
          loadSessoes();
        } catch (e: any) {
          alert(e.message);
        }
      },
    });
  };

  const handleDeleteVenda = (id: string) => {
    setAdminActionModal({
      open: true,
      title: "ATENÇÃO: Excluir Venda",
      message:
        "Você está prestes a excluir um registro de venda. O valor será removido do financeiro e os totais do caixa serão recalculados.\n\nIMPORTANTE: O estoque NÃO será devolvido automaticamente aos lotes para evitar inconsistências. Faça o ajuste manual de estoque se necessário.",
      onConfirm: async () => {
        try {
          await adminApi.deleteVenda(id);
          // Refresh details
          if (selectedSessao) handleOpenDetails(selectedSessao.id);
          // Refresh main list too
          loadSessoes();
        } catch (e: any) {
          alert(e.message);
        }
      },
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* HEADER */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <h3 className="text-xl font-bold text-slate-800">
          Histórico de Caixas (Vendas)
        </h3>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenContas}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2"
          >
            <Icons.Cash /> Contas de Faturamento
          </button>
          <button
            onClick={loadSessoes}
            className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-lg transition-colors"
            title="Atualizar"
          >
            <Icons.Refresh />
          </button>
        </div>
      </div>

      <div className="p-8 max-w-screen-2xl mx-auto w-full animate-fadeIn">
        <Table
          headers={[
            "Data / Status",
            "Operador / Saldo Inicial",
            "Saldo Final / Quebra",
            "Saldo Final / Qtd",
            "Ações",
          ]}
        >
          {sessoes.map((s) => {
            const isOpen = s.status === "ABERTO";
            const hasQuebra = s.quebra_caixa && Math.abs(s.quebra_caixa) > 0.05;
            const quebraPositiva = (s.quebra_caixa || 0) > 0;
            // Vendas Totais = soma de todas as formas de pagamento
            const vendasTotais = isOpen ? 0 : s.total_vendas || 0;
            // Saldo Final = Vendas Totais + Quebra de Caixa (sem movimentações extras como sangrias)
            const saldoFinal = isOpen
              ? 0
              : vendasTotais + (s.quebra_caixa || 0);
            const dataAberturaStr = formatDate(s.data_abertura);
            const dataFechamentoStr = s.data_fechamento
              ? formatDate(s.data_fechamento)
              : null;

            return (
              <tr
                key={s.id}
                className={`hover:bg-slate-50 transition-colors ${isOpen ? "bg-emerald-50/30" : ""}`}
              >
                {/* Col 1: Data / Status */}
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-700">
                    {dataAberturaStr}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {isOpen ? (
                      <span className="inline-block bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded animate-pulse text-[10px] font-bold">
                        Ainda aberto
                      </span>
                    ) : (
                      <span className="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
                        Fechou: {dataFechamentoStr}
                      </span>
                    )}
                  </div>
                </td>

                {/* Col 2: Operador / Saldo Inicial */}
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-700">
                    {s.usuario.nome}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Saldo: {formatMoney(s.saldo_inicial)}
                  </div>
                </td>

                {/* Col 3: Saldo Final / Quebra */}
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-800">
                    {isOpen ? "-" : formatMoney(s.saldo_final_declarado || 0)}
                  </div>
                  <div className="text-xs mt-1">
                    {isOpen ? (
                      <span className="text-slate-400">-</span>
                    ) : (
                      <span
                        className={`font-bold ${hasQuebra ? (quebraPositiva ? "text-emerald-600" : "text-rose-600") : "text-slate-400"}`}
                      >
                        {hasQuebra
                          ? (quebraPositiva ? "+" : "") +
                            formatMoney(s.quebra_caixa || 0)
                          : "OK"}
                      </span>
                    )}
                  </div>
                </td>

                {/* Col 4: Saldo Final / Qtd */}
                <td className="px-6 py-4">
                  <div
                    className={`font-bold text-base ${
                      isOpen
                        ? "text-slate-400"
                        : saldoFinal >= 0
                          ? "text-emerald-600"
                          : "text-rose-600"
                    }`}
                  >
                    {isOpen ? "-" : formatMoney(saldoFinal)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {s._count?.vendas || 0} ticket
                    {(s._count?.vendas || 0) !== 1 ? "s" : ""}
                  </div>
                </td>

                {/* Col 5: Ações */}
                <td className="px-6 py-4 flex gap-2">
                  <button
                    onClick={() => handleOpenDetails(s.id)}
                    className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg font-medium text-sm flex items-center gap-1 transition-colors"
                  >
                    <Icons.Receipt /> Detalhes
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteSessao(s.id)}
                      className="text-rose-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Excluir Sessão (Admin)"
                    >
                      <Icons.Trash />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </div>

      {/* MODAL CONTAS DE FATURAMENTO */}
      <Modal
        open={contasModalOpen}
        title="Contas de Faturamento (Recebíveis)"
        onClose={() => setContasModalOpen(false)}
      >
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-xl border border-indigo-100">
            <div>
              <h4 className="font-bold text-indigo-900">
                Destinos de Recebimento
              </h4>
              <p className="text-xs text-indigo-600 mt-1">
                Configure para onde vai o dinheiro de cada forma de pagamento.
              </p>
            </div>
            {!showNewContaForm && (
              <button
                onClick={() => setShowNewContaForm(true)}
                className="bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md hover:bg-indigo-700 flex items-center gap-2 transition-all"
              >
                <Icons.Plus /> Incluir Conta
              </button>
            )}
          </div>

          {showNewContaForm && (
            <form
              onSubmit={handleCreateConta}
              className="bg-white border border-slate-200 p-4 rounded-xl space-y-4 animate-fadeIn shadow-sm"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 uppercase">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Nome do Banco/Operadora
                  </label>
                  <input
                    className="w-full p-2.5 text-sm border rounded-lg bg-slate-50 focus:bg-white transition-colors"
                    placeholder="Ex: Nubank, Cielo, Rede..."
                    required
                    value={newContaForm.nome}
                    onChange={(e) =>
                      setNewContaForm({ ...newContaForm, nome: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Tipo de Recebimento
                  </label>
                  <select
                    className="w-full p-2.5 text-sm border rounded-lg bg-white"
                    value={newContaForm.tipo}
                    onChange={(e) =>
                      setNewContaForm({ ...newContaForm, tipo: e.target.value })
                    }
                  >
                    <option>Conta Pix</option>
                    <option>Cartão Débito</option>
                    <option>Cartão Crédito</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2.5 px-6 rounded-lg shadow-md transition-all">
                  Salvar Conta
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contas.length === 0 ? (
              <p className="col-span-2 text-center text-slate-400 py-8 italic">
                Nenhuma conta cadastrada.
              </p>
            ) : (
              contas.map((c) => (
                <div
                  key={c.id}
                  className="p-4 border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex justify-between items-center group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                        c.tipo === "Conta Pix"
                          ? "bg-emerald-100 text-emerald-600"
                          : c.tipo === "Cartão Crédito"
                            ? "bg-purple-100 text-purple-600"
                            : "bg-blue-100 text-blue-600"
                      }`}
                    >
                      {c.tipo === "Conta Pix" ? "💠" : "💳"}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">
                        {c.nome}
                      </h4>
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        {c.tipo}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openExtratoConta(c)}
                      className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg font-medium text-sm flex items-center gap-1 transition-colors"
                    >
                      <Icons.History />
                    </button>
                    <button
                      onClick={() => handleDeleteConta(c.id)}
                      className="text-slate-300 hover:text-rose-500 p-2 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      <Icons.Trash />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL DETALHES COMPLETO (SESSÃO) */}
      <Modal
        open={modalOpen}
        title={`Caixa #${selectedSessao?.id.substring(0, 6) || "..."}`}
        onClose={() => setModalOpen(false)}
      >
        {loadingDetails || !selectedSessao ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">
            Carregando dados detalhados...
          </div>
        ) : (
          <div className="space-y-6">
            {/* HEADER INFO */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">
                  Operador
                </span>
                <div className="font-bold text-slate-800">
                  {selectedSessao.usuario.nome}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">
                  Abertura
                </span>
                <div className="text-sm text-slate-700">
                  {formatDate(selectedSessao.data_abertura)}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">
                  Fechamento
                </span>
                <div className="text-sm text-slate-700">
                  {selectedSessao.data_fechamento
                    ? formatDate(selectedSessao.data_fechamento)
                    : "Em Aberto"}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">
                  Saldo Final
                </span>
                <div
                  className={`font-bold text-lg ${
                    selectedSessao.status === "FECHADO"
                      ? (selectedSessao.total_vendas || 0) +
                          (selectedSessao.quebra_caixa || 0) >=
                        0
                        ? "text-emerald-600"
                        : "text-rose-600"
                      : "text-slate-500"
                  }`}
                >
                  {selectedSessao.status === "FECHADO"
                    ? formatMoney(
                        (selectedSessao.total_vendas || 0) +
                          (selectedSessao.quebra_caixa || 0),
                      )
                    : "-"}
                </div>
              </div>
            </div>

            {/* TABS NAVIGATION */}
            <div className="border-b border-slate-200 flex gap-6">
              <button
                onClick={() => setActiveTab("resumo")}
                className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "resumo" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                Resumo Financeiro
              </button>
              <button
                onClick={() => setActiveTab("tickets")}
                className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "tickets" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                Tickets de Venda ({selectedSessao.vendas?.length})
              </button>
              <button
                onClick={() => setActiveTab("movimentacoes")}
                className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "movimentacoes" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                Movimentações ({selectedSessao.movimentacoes?.length})
              </button>
            </div>

            {/* TAB CONTENT */}
            <div className="h-[400px] overflow-y-auto pr-2">
              {/* --- TAB RESUMO --- */}
              {activeTab === "resumo" && (
                <div className="space-y-6 animate-fadeIn">
                  {/* TOP CARDS: Valor Inicial, Final, Quebra, Faturamento Total */}
                  {selectedSessao.status === "FECHADO" && (
                    <div className="grid grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg border border-slate-100 bg-white shadow-sm">
                        <div className="text-[11px] text-slate-500 uppercase font-bold mb-1">
                          Valor Inicial
                        </div>
                        <div className="text-xl font-bold text-indigo-600">
                          {formatMoney(selectedSessao.saldo_inicial)}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg border border-slate-100 bg-white shadow-sm">
                        <div className="text-[11px] text-slate-500 uppercase font-bold mb-1">
                          Valor Final
                        </div>
                        <div className="text-xl font-bold text-slate-800">
                          {formatMoney(
                            selectedSessao.saldo_final_declarado || 0,
                          )}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg border border-slate-100 bg-white shadow-sm">
                        <div className="text-[11px] text-slate-500 uppercase font-bold mb-1">
                          Quebra de Caixa
                        </div>
                        <div
                          className={`text-xl font-bold ${(selectedSessao.saldo_final_declarado || 0) - (selectedSessao.saldo_inicial + (selectedSessao.total_dinheiro || 0)) < 0 ? "text-rose-600" : (selectedSessao.saldo_final_declarado || 0) - (selectedSessao.saldo_inicial + (selectedSessao.total_dinheiro || 0)) > 0 ? "text-emerald-600" : "text-slate-400"}`}
                        >
                          {formatMoney(
                            (selectedSessao.saldo_final_declarado || 0) -
                              (selectedSessao.saldo_inicial +
                                (selectedSessao.total_dinheiro || 0)),
                          )}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50 shadow-sm">
                        <div className="text-[11px] text-indigo-700 uppercase font-bold mb-1">
                          Vendas Totais
                        </div>
                        <div className="text-xl font-bold text-indigo-700">
                          {formatMoney(selectedSessao.total_vendas || 0)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Conferência Detalhada */}
                  <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                    <h4 className="font-bold text-gray-700 mb-4 border-b pb-2">
                      Conferência de Caixa (Dinheiro)
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>(+) Fundo de Troco (Dinheiro)</span>
                        <span className="font-mono">
                          {formatMoney(selectedSessao.saldo_inicial)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>(+) Vendas em Dinheiro</span>
                        <span className="font-mono">
                          {formatMoney(selectedSessao.total_dinheiro || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-gray-300 pt-2">
                        <span className="font-bold">Subtotal (Dinheiro)</span>
                        <span className="font-bold">
                          {formatMoney(
                            selectedSessao.saldo_inicial +
                              (selectedSessao.total_dinheiro || 0),
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Movimentações */}
                  <div className="bg-blue-50 p-5 rounded-xl border border-blue-200">
                    <h4 className="font-bold text-blue-900 mb-3 border-b pb-2">
                      Movimentações Extra
                    </h4>
                    {selectedSessao.movimentacoes &&
                    selectedSessao.movimentacoes.length > 0 ? (
                      <div className="space-y-2 text-sm">
                        {selectedSessao.movimentacoes.map((m) => (
                          <div
                            key={m.id}
                            className="flex justify-between items-center p-2 bg-white rounded border border-blue-100"
                          >
                            <div>
                              <span
                                className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded mr-2 ${m.tipo === "SANGRIA" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}
                              >
                                {m.tipo}
                              </span>
                              <span className="text-slate-600">
                                {m.descricao || "-"}
                              </span>
                            </div>
                            <span
                              className={`font-bold ${m.tipo === "SANGRIA" ? "text-rose-600" : "text-emerald-600"}`}
                            >
                              {m.tipo === "SANGRIA" ? "-" : "+"}{" "}
                              {formatMoney(m.valor)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm italic">
                        Nenhuma movimentação registrada.
                      </p>
                    )}
                  </div>

                  {/* Vendas por Forma de Recebimento */}
                  <div className="bg-purple-50 p-5 rounded-xl border border-purple-200">
                    <h4 className="font-bold text-purple-900 mb-3 border-b pb-2">
                      Vendas por Forma de Recebimento
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between p-2 bg-white rounded border border-purple-100">
                        <span>💵 Dinheiro</span>
                        <span className="font-bold">
                          {formatMoney(selectedSessao.total_dinheiro || 0)}
                        </span>
                      </div>

                      {Object.entries(totaisPorConta).length > 0 ? (
                        Object.entries(totaisPorConta).map(([key, conta]) => (
                          <div
                            key={key}
                            className="flex justify-between p-2 bg-white rounded border border-purple-100"
                          >
                            <span>{conta.nome || "Conta"}</span>
                            <span className="font-bold">
                              {formatMoney(conta.total || 0)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="flex justify-between p-2 bg-slate-100 rounded border border-slate-200 text-slate-500 text-xs italic">
                          <span>Nenhuma conta de recebimento</span>
                        </div>
                      )}

                      <div className="flex justify-between p-2 bg-purple-100 rounded border border-purple-200 font-bold">
                        <span>Total de Vendas</span>
                        <span>
                          {formatMoney(selectedSessao.total_vendas || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* --- TAB TICKETS --- */}
              {activeTab === "tickets" && (
                <div className="animate-fadeIn">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase text-slate-500 sticky top-0">
                      <tr>
                        <th className="p-3">Hora</th>
                        <th className="p-3">Pagamento</th>
                        <th className="p-3 text-right">Valor</th>
                        <th className="p-3">Itens</th>
                        {isAdmin && <th className="p-3 text-center">Ações</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSessao.vendas?.map((v) => {
                        const formaPagamento =
                          v.contaBancaria?.nome ||
                          v.tipo_pagamento ||
                          "Dinheiro";
                        return (
                          <tr key={v.id} className="hover:bg-slate-50">
                            <td className="p-3 text-slate-600 font-mono">
                              {formatDate(v.data_venda).split(" ")[1]}
                            </td>
                            <td className="p-3">
                              <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded border border-slate-200">
                                {formaPagamento}
                              </span>
                            </td>
                            <td className="p-3 text-right font-bold text-slate-800">
                              {formatMoney(v.total)}
                            </td>
                            <td className="p-3 text-xs text-slate-500">
                              {v.itens.map((i) => (
                                <div key={i.id}>
                                  {i.qtd}x {i.produto.nome}
                                </div>
                              ))}
                            </td>
                            {isAdmin && (
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => handleDeleteVenda(v.id)}
                                  className="text-rose-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded transition-colors"
                                  title="Excluir Venda (Admin)"
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
                </div>
              )}

              {/* --- TAB MOVIMENTACOES --- */}
              {activeTab === "movimentacoes" && (
                <div className="animate-fadeIn">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase text-slate-500 sticky top-0">
                      <tr>
                        <th className="p-3">Hora</th>
                        <th className="p-3">Tipo</th>
                        <th className="p-3">Valor</th>
                        <th className="p-3">Motivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!selectedSessao.movimentacoes ||
                      selectedSessao.movimentacoes.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-4 text-center text-slate-400"
                          >
                            Nenhuma movimentação extra registrada.
                          </td>
                        </tr>
                      ) : (
                        selectedSessao.movimentacoes.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="p-3 text-slate-600 font-mono">
                              {formatDate(m.data).split(" ")[1]}
                            </td>
                            <td className="p-3">
                              <span
                                className={`text-[10px] font-bold px-2 py-1 rounded ${m.tipo === "SANGRIA" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}
                              >
                                {m.tipo}
                              </span>
                            </td>
                            <td className="p-3 font-bold">
                              {formatMoney(m.valor)}
                            </td>
                            <td className="p-3 text-slate-600">
                              {m.descricao || "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* EXTRATO DE CONTA (RECEBÍVEIS) */}
      <Modal
        open={extratoModalOpen}
        title={`Extrato - ${selectedConta?.nome || "..."}`}
        onClose={() => setExtratoModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-bold text-slate-600">
              Competência
            </label>
            <input
              type="month"
              value={`${extratoPeriod.ano}-${String(extratoPeriod.mes).padStart(2, "0")}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-");
                const mes = parseInt(m, 10);
                const ano = parseInt(y, 10);
                setExtratoPeriod({ mes, ano });
                if (selectedConta)
                  fetchExtratoConta(selectedConta.id, mes, ano);
              }}
              className="p-2 border rounded-lg"
            />
          </div>

          {!extratoContaData ? (
            <div className="p-8 text-center text-slate-400">
              Nenhum dado disponível
            </div>
          ) : (
            <div>
              <div className="mb-4 text-sm text-slate-600">
                Total:{" "}
                <span className="font-bold text-slate-800">
                  {formatMoney(extratoContaData.total || 0)}
                </span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {extratoContaData.itens.map((it: any) => (
                  <div
                    key={it.id}
                    className="p-3 bg-white border rounded-lg flex justify-between items-center"
                  >
                    <div>
                      <div className="font-bold text-slate-700">
                        {it.descricao}
                      </div>
                      <div className="text-xs text-slate-500">
                              {formatDate(it.data)}
                      </div>
                    </div>
                    <div
                      className={`font-bold ${it.tipo === "ENTRADA" ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {formatMoney(it.valor)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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
          <p className="text-slate-600 whitespace-pre-wrap">
            {adminActionModal.message}
          </p>
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
              Confirmar Exclusão
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
