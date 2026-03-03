import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../api";
import { Icons } from "../components/Icons";
import { DocumentInput, Modal } from "../components/Shared";
import { Fornecedor, FornecedorDetalhesResponse } from "../types";
import {
  fetchCep,
  formatCPFCNPJ,
  formatDate,
  formatMoney,
  formatPhone,
  maskCEP,
} from "../utils";

const emptyFornecedorForm: Partial<Fornecedor> = {
  nome: "",
  cnpj: "",
  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  contatoNome: "",
  contatoTelefone: "",
  contatoEmail: "",
  prazoEntrega: "",
  diaEntrega: "",
};

export function FornecedoresTab() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  // Filters
  const [companyFilter, setCompanyFilter] = useState("");
  const [addressFilter, setAddressFilter] = useState("");
  const [contactFilter, setContactFilter] = useState("");

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  const [form, setForm] = useState(emptyFornecedorForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] =
    useState<FornecedorDetalhesResponse | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<
    "geral" | "produtos" | "compras" | "catalogo"
  >("geral");
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

  // Address UX
  const [cepError, setCepError] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const numeroRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      setFornecedores(await adminApi.getFornecedores());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter Logic
  const filteredFornecedores = useMemo(() => {
    return fornecedores.filter((f) => {
      if (companyFilter) {
        const term = companyFilter.toLowerCase();
        if (!f.nome.toLowerCase().includes(term) && !f.cnpj.includes(term))
          return false;
      }
      if (addressFilter) {
        const term = addressFilter.toLowerCase();
        const address =
          `${f.rua} ${f.cidade} ${f.estado} ${f.cep}`.toLowerCase();
        if (!address.includes(term)) return false;
      }
      if (contactFilter) {
        const term = contactFilter.toLowerCase();
        const contact =
          `${f.contatoNome} ${f.contatoTelefone} ${f.contatoEmail}`.toLowerCase();
        if (!contact.includes(term)) return false;
      }
      return true;
    });
  }, [fornecedores, companyFilter, addressFilter, contactFilter]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (cepError) return;
    try {
      if (editingId) await adminApi.updateFornecedor(editingId, form);
      else await adminApi.createFornecedor(form);
      setModalOpen(false);
      loadData();
    } catch (e: any) {
      setAlertModal({
        open: true,
        title: "Erro ao salvar",
        message: e?.message || "Não foi possível salvar o fornecedor.",
      });
    }
  };

  const openModal = (f?: Fornecedor) => {
    setEditingId(f ? f.id : null);
    setForm(f ? { ...f, cep: maskCEP(f.cep || "") } : emptyFornecedorForm);
    setCepError("");
    setModalOpen(true);
  };

  const openDetails = async (id: string) => {
    setSelectedDetails(null);
    setDetailsModalOpen(true);
    setActiveDetailTab("geral");
    try {
      const details = await adminApi.getFornecedorDetalhes(id);
      setSelectedDetails(details);
    } catch (e) {
      console.error(e);
      setDetailsModalOpen(false);
    }
  };


  const handleDelete = async (id: string) => {
    setConfirmModal({
      open: true,
      title: "Excluir Fornecedor",
      message: "Tem certeza que deseja excluir este fornecedor?",
      onConfirm: async () => {
        try {
          await adminApi.deleteFornecedor(id);
          loadData();
        } catch (e: any) {
          setAlertModal({
            open: true,
            title: "Erro ao excluir",
            message: e?.message || "Não foi possível excluir o fornecedor.",
          });
        }
      },
    });
  };

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const masked = maskCEP(raw);
    setForm({ ...form, cep: masked });
    setCepError("");

    const clean = masked.replace(/\D/g, "");
    if (clean.length === 8) {
      setCepLoading(true);
      try {
        const data = await fetchCep(clean);
        if (data) {
          setForm((prev) => ({
            ...prev,
            cep: masked,
            rua: data.rua,
            bairro: data.bairro,
            cidade: data.cidade,
            estado: data.estado,
          }));
          setTimeout(() => numeroRef.current?.focus(), 100);
        }
      } catch (err) {
        setCepError("CEP Inválido");
        setForm((prev) => ({
          ...prev,
          cep: masked,
          rua: "",
          bairro: "",
          cidade: "",
          estado: "",
        }));
      } finally {
        setCepLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ... Header and Filters (Unchanged) ... */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <h3 className="text-xl font-bold text-slate-800">
          Parceiros e Fornecedores
        </h3>
        <button
          onClick={() => openModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold flex gap-2 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
        >
          <Icons.Plus /> Novo Fornecedor
        </button>
      </div>

      <div className="p-8 space-y-4 max-w-screen-2xl mx-auto w-full animate-fadeIn">
        {/* FILTROS DE PESQUISA */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="relative">
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
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Empresa ou CNPJ..."
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
            />
          </div>
          <div className="relative">
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
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Endereço, Cidade ou CEP..."
              value={addressFilter}
              onChange={(e) => setAddressFilter(e.target.value)}
            />
          </div>
          <div className="relative">
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
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </div>
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Nome Contato ou Telefone..."
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value)}
            />
          </div>
        </div>

        {/* Listagem (Unchanged) */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Empresa
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Endereço
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Contato
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Produtos e Lotes
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredFornecedores.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800">{f.nome}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {formatCPFCNPJ(f.cnpj)}
                    </div>
                  </td>
                  <td className="px-6 py-4 max-w-xs">
                    <div className="truncate text-slate-600">
                      {f.rua ? `${f.rua}, ${f.numero}` : "-"}
                    </div>
                    <div className="text-xs text-slate-400">
                      {f.cidade ? `${f.cidade}/${f.estado}` : ""}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-700">
                      {f.contatoNome}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatPhone(f.contatoTelefone)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold border border-indigo-100">
                        {f.produtosCount || 0} Produtos
                      </span>
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border border-slate-200">
                        {f.lotesCount || 0} Lotes
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openDetails(f.id)}
                        className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded transition-colors"
                        title="Ver Detalhes"
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
                      <button
                        onClick={() => openModal(f)}
                        className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded transition-colors"
                        title="Editar"
                      >
                        <Icons.Edit />
                      </button>
                      <button
                        onClick={() => handleDelete(f.id)}
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
      </div>

      {/* Modal Details (Unchanged) */}
      <Modal
        open={detailsModalOpen}
        title="Ficha do Fornecedor"
        onClose={() => setDetailsModalOpen(false)}
      >
        {!selectedDetails ? (
          <div className="p-10 text-center text-slate-400 animate-pulse">
            Carregando informações...
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
              <div className="flex-1 space-y-2">
                <h2 className="text-2xl font-bold text-slate-800">
                  {selectedDetails.fornecedor.nome}
                </h2>
                <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    <Icons.Supplier />{" "}
                    {formatCPFCNPJ(selectedDetails.fornecedor.cnpj)}
                  </span>
                  <span className="flex items-center gap-1">
                    Prazo:{" "}
                    <strong>{selectedDetails.fornecedor.prazoEntrega || "-"}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    Entrega:{" "}
                    <strong>{selectedDetails.fornecedor.diaEntrega || "-"}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex border-b border-slate-200 mb-4">
              <button
                onClick={() => setActiveDetailTab("geral")}
                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeDetailTab === "geral" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                Dados do Fornecedor
              </button>
              <button
                onClick={() => setActiveDetailTab("compras")}
                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeDetailTab === "compras" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                Histórico de Compras
              </button>
              <button
                onClick={() => setActiveDetailTab("produtos")}
                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeDetailTab === "produtos" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                Produtos Comprados
              </button>
              <button
                onClick={() => setActiveDetailTab("catalogo")}
                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeDetailTab === "catalogo" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                Catálogo de Produtos
              </button>
            </div>

            {activeDetailTab === "geral" && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-slate-400 uppercase">CNPJ</div>
                  <div className="font-mono text-slate-700">
                    {formatCPFCNPJ(selectedDetails.fornecedor.cnpj)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase">Contato</div>
                  <div className="text-slate-700">
                    {selectedDetails.fornecedor.contatoNome || "-"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatPhone(selectedDetails.fornecedor.contatoTelefone)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase">Email</div>
                  <div className="text-slate-700">
                    {selectedDetails.fornecedor.contatoEmail || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase">Endereço</div>
                  <div className="text-slate-700">
                    {selectedDetails.fornecedor.rua
                      ? `${selectedDetails.fornecedor.rua}, ${selectedDetails.fornecedor.numero || ""}`
                      : "-"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedDetails.fornecedor.bairro || "-"} •{" "}
                    {selectedDetails.fornecedor.cidade || "-"} /{" "}
                    {selectedDetails.fornecedor.estado || "-"} •{" "}
                    {selectedDetails.fornecedor.cep || "-"}
                  </div>
                </div>
              </div>
            )}

            {activeDetailTab === "compras" && (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-3">Data</th>
                      <th className="p-3">Código</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDetails.historicoCompras.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="p-3 text-slate-600">
                          {formatDate(c.data_compra).split(" ")[0]}
                        </td>
                        <td className="p-3 font-mono text-slate-700">
                          {c.codigo || c.referencia || c.id}
                        </td>
                        <td className="p-3 text-slate-600">{c.status}</td>
                        <td className="p-3 text-right font-bold text-slate-800">
                          {formatMoney(c.total)}
                        </td>
                      </tr>
                    ))}
                    {selectedDetails.historicoCompras.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-6 text-center text-slate-400"
                        >
                          Nenhuma compra registrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeDetailTab === "produtos" && (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-3">Produto</th>
                      <th className="p-3">Categoria</th>
                      <th className="p-3">Estoque</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDetails.produtos.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-bold">{p.nome}</div>
                          <div className="text-[10px] text-slate-400">
                            {p.codigo_barras}
                          </div>
                        </td>
                        <td className="p-3 text-slate-600">
                          {p.categoria || "-"}
                        </td>
                        <td className="p-3 text-slate-600">{p.estoque}</td>
                      </tr>
                    ))}
                    {selectedDetails.produtos.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="p-6 text-center text-slate-400"
                        >
                          Nenhum produto associado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeDetailTab === "catalogo" && (
              <div className="space-y-4">
                <div className="text-sm text-slate-500">
                  Produtos cadastrados no catálogo do fornecedor (somente
                  leitura). Edite ou exclua produtos pela guia Produtos.
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="p-3">Descrição</th>
                        <th className="p-3">Código</th>
                        <th className="p-3">Embalagem (Tipo)</th>
                        <th className="p-3">Embalagem (Unidade)</th>
                        <th className="p-3">Embalagem (Qtd)</th>
                        <th className="p-3">Preço Emb.</th>
                        <th className="p-3">Preço Un.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedDetails.produtos?.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-700">
                            {c.nome}
                          </td>
                          <td className="p-3 text-slate-600">
                            {c.codigoCatalogo || "-"}
                          </td>
                          <td className="p-3 text-slate-600">
                            {c.embalagemTipo || "-"}
                          </td>
                          <td className="p-3 text-slate-600">
                            {c.embalagemUnidade || "-"}
                          </td>
                          <td className="p-3 text-slate-600">
                            {c.embalagemQuantidade || 0}
                          </td>
                          <td className="p-3 text-slate-600">
                            {formatMoney(c.precoEmbalagem)}
                          </td>
                          <td className="p-3 text-slate-600">
                            {formatMoney(c.precoUnidade)}
                          </td>
                        </tr>
                      ))}
                      {(!selectedDetails.produtos ||
                        selectedDetails.produtos.length === 0) && (
                        <tr>
                          <td
                            colSpan={7}
                            className="p-6 text-center text-slate-400"
                          >
                            Nenhum produto no catálogo.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
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

      {/* MODAL EDITAR / NOVO */}
      <Modal
        open={modalOpen}
        title={editingId ? "Editar Fornecedor" : "Novo Fornecedor"}
        onClose={() => setModalOpen(false)}
      >
        <form className="space-y-4" onSubmit={handleSave}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                CPF / CNPJ
              </label>
              <DocumentInput
                value={form.cnpj}
                onChange={(val) => setForm({ ...form, cnpj: val })}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Empresa
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                required
                value={form.nome || ""}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-2 border-t">
            <span className="text-xs font-bold text-slate-400">ENDEREÇO</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                CEP
              </label>
              <div className="relative">
                <input
                  className={`w-full p-2.5 border rounded-lg ${cepError ? "border-rose-500 focus:ring-rose-500" : ""}`}
                  maxLength={9}
                  value={form.cep || ""}
                  onChange={handleCepChange}
                  placeholder="00.000-000"
                />
                {cepLoading && (
                  <div className="absolute right-3 top-3">
                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
              {cepError && (
                <p className="text-xs text-rose-500 mt-1 font-bold">
                  {cepError}
                </p>
              )}
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Rua
              </label>
              <input
                className="w-full p-2.5 border rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                readOnly
                value={form.rua || ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Número
              </label>
              <input
                ref={numeroRef}
                className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                value={form.numero || ""}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
                placeholder="Nº"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Comp.
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                value={form.complemento || ""}
                onChange={(e) =>
                  setForm({ ...form, complemento: e.target.value })
                }
                placeholder="Galpão, Sala..."
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Bairro
              </label>
              <input
                className="w-full p-2.5 border rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                readOnly
                value={form.bairro || ""}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Cidade
              </label>
              <input
                className="w-full p-2.5 border rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                readOnly
                value={form.cidade || ""}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                UF
              </label>
              <input
                className="w-full p-2.5 border rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                readOnly
                value={form.estado || ""}
              />
            </div>
          </div>

          <div className="pt-2 border-t">
            <span className="text-xs font-bold text-slate-400">
              CONTATO & LOGÍSTICA
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Nome Contato
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                value={form.contatoNome || ""}
                onChange={(e) =>
                  setForm({ ...form, contatoNome: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Telefone
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                value={formatPhone(form.contatoTelefone) || ""}
                onChange={(e) =>
                  setForm({ ...form, contatoTelefone: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Email
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                value={form.contatoEmail || ""}
                onChange={(e) =>
                  setForm({ ...form, contatoEmail: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Prazo (dias)
                </label>
                <input
                  className="w-full p-2.5 border rounded-lg"
                  placeholder="Ex: 7"
                  value={form.prazoEntrega || ""}
                  onChange={(e) =>
                    setForm({ ...form, prazoEntrega: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Dia Entrega
                </label>
                <input
                  className="w-full p-2.5 border rounded-lg"
                  placeholder="Ex: Seg"
                  value={form.diaEntrega || ""}
                  onChange={(e) =>
                    setForm({ ...form, diaEntrega: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <button
            disabled={!!cepError || cepLoading}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 mt-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Salvar
          </button>
        </form>
      </Modal>
    </div>
  );
}
