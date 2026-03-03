import React, { FormEvent, useEffect, useRef, useState } from "react";
import { adminApi } from "../api";
import { Icons } from "../components/Icons";
import { DocumentInput, Modal, Table } from "../components/Shared";
import { Cliente, ClienteDetalhesResponse } from "../types";
import {
  fetchCep,
  formatCPFCNPJ,
  formatMoney,
  formatPhone,
  formatDateOnly,
  maskCEP,
} from "../utils";

const emptyClienteForm: Partial<Cliente> = {
  nome: "",
  documento: "",
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
};

export function ClientesTab() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyClienteForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedDetails, setSelectedDetails] =
    useState<ClienteDetalhesResponse | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<
    "detalhes" | "historico"
  >("detalhes");
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

  // Address UX States
  const [cepError, setCepError] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const numeroRef = useRef<HTMLInputElement>(null);

  const loadData = async (q?: string) => {
    try {
      setClientes(await adminApi.getClientes(q));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!searchTerm.trim()) loadData();
      else loadData(searchTerm.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (cepError) return; // Prevent save if CEP is invalid
    try {
      if (editingId) await adminApi.updateCliente(editingId, form);
      else await adminApi.createCliente(form);
      setModalOpen(false);
      loadData();
    } catch (e: any) {
      setAlertModal({
        open: true,
        title: "Erro ao salvar",
        message: e?.message || "Não foi possível salvar o cliente.",
      });
    }
  };

  const openModal = (c?: Cliente) => {
    setEditingId(c ? c.id : null);
    setForm(c ? { ...c, cep: maskCEP(c.cep || "") } : emptyClienteForm);
    setCepError("");
    setModalOpen(true);
  };

  const openDetails = async (id: string) => {
    setSelectedDetails(null);
    setDetailsModalOpen(true);
    setActiveDetailTab("detalhes");
    try {
      const details = await adminApi.getClienteDetalhes(id);
      setSelectedDetails(details);
    } catch (e) {
      console.error(e);
      setDetailsModalOpen(false);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmModal({
      open: true,
      title: "Excluir Cliente",
      message: "Tem certeza que deseja excluir este cliente?",
      onConfirm: async () => {
        try {
          await adminApi.deleteCliente(id);
          loadData();
        } catch (e: any) {
          setAlertModal({
            open: true,
            title: "Erro ao excluir",
            message: e?.message || "Não foi possível excluir o cliente.",
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
          // Auto focus on number
          setTimeout(() => numeroRef.current?.focus(), 100);
        }
      } catch (err) {
        setCepError("CEP Inválido");
        // Clear address fields on error
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
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-slate-800">
            Carteira de Clientes
          </h3>
          <div className="text-xs text-slate-500">
            Gerencie cadastros e histórico de compras.
          </div>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-indigo-500/30 transition-all"
        >
          <Icons.Plus /> Novo Cliente
        </button>
      </div>

      <div className="p-8 space-y-4 max-w-screen-2xl mx-auto w-full animate-fadeIn">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <input
            className="w-full p-2.5 border rounded-lg"
            placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Table headers={["Cliente", "Endereço", "Contato", "Ações"]}>
          {clientes.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50 text-sm">
              <td className="px-6 py-4">
                <div className="font-bold text-slate-700">{c.nome}</div>
                <div className="text-xs text-slate-500">
                  {formatCPFCNPJ(c.documento)}
                </div>
              </td>
              <td className="px-6 py-4 max-w-xs truncate">
                {c.cidade ? `${c.cidade}/${c.estado}` : "-"}
              </td>
              <td className="px-6 py-4">
                <div>{c.contatoNome}</div>
                <div className="text-xs text-slate-500">
                  {formatPhone(c.contatoTelefone)}
                </div>
              </td>
              <td className="px-6 py-4 flex gap-2">
                <button
                  onClick={() => openDetails(c.id)}
                  className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded transition-colors"
                  title="Detalhes"
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
                  onClick={() => openModal(c)}
                  className="text-indigo-600 p-2 hover:bg-indigo-50 rounded"
                >
                  <Icons.Edit />
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg"
                >
                  <Icons.Trash />
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </div>

      <Modal
        open={modalOpen}
        title={editingId ? "Editar Cliente" : "Novo Cliente"}
        onClose={() => setModalOpen(false)}
      >
        <form className="space-y-4" onSubmit={handleSave}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                CPF / CNPJ
              </label>
              <DocumentInput
                value={form.documento || ""}
                onChange={(val) => setForm({ ...form, documento: val })}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Nome
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
                placeholder="Apto, Sala..."
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
            <span className="text-xs font-bold text-slate-400">CONTATO</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Nome do Contato
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
                Telefone do Contato
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                value={form.contatoTelefone || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    contatoTelefone: formatPhone(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Email do Contato
              </label>
              <input
                className="w-full p-2.5 border rounded-lg"
                type="email"
                value={form.contatoEmail || ""}
                onChange={(e) =>
                  setForm({ ...form, contatoEmail: e.target.value })
                }
              />
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

      <Modal
        open={detailsModalOpen}
        title="Detalhes do Cliente"
        onClose={() => setDetailsModalOpen(false)}
      >
        {!selectedDetails ? (
          <div className="p-10 text-center text-slate-400 animate-pulse">
            Carregando informações...
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex border-b border-slate-200 mb-4">
              <button
                onClick={() => setActiveDetailTab("detalhes")}
                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeDetailTab === "detalhes" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                Detalhes
              </button>
              <button
                onClick={() => setActiveDetailTab("historico")}
                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeDetailTab === "historico" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                Histórico de Compras
              </button>
            </div>

            {activeDetailTab === "detalhes" && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-slate-400 uppercase">Nome</div>
                  <div className="font-bold text-slate-800">
                    {selectedDetails.cliente.nome}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase">CPF/CNPJ</div>
                  <div className="font-mono text-slate-700">
                    {formatCPFCNPJ(selectedDetails.cliente.documento)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase">Contato</div>
                  <div className="text-slate-700">
                    {selectedDetails.cliente.contatoNome || "-"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatPhone(selectedDetails.cliente.contatoTelefone)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase">Email</div>
                  <div className="text-slate-700">
                    {selectedDetails.cliente.contatoEmail || "-"}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-slate-400 uppercase">Endereço</div>
                  <div className="text-slate-700">
                    {selectedDetails.cliente.rua
                      ? `${selectedDetails.cliente.rua}, ${selectedDetails.cliente.numero || ""}`
                      : "-"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedDetails.cliente.bairro || "-"} •{" "}
                    {selectedDetails.cliente.cidade || "-"} /{" "}
                    {selectedDetails.cliente.estado || "-"} •{" "}
                    {selectedDetails.cliente.cep || "-"}
                  </div>
                </div>
              </div>
            )}

            {activeDetailTab === "historico" && (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-3">Data</th>
                      <th className="p-3">Código</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Itens</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDetails.historicoCompras.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50">
                        <td className="p-3 text-slate-600">
                          {formatDateOnly(v.data_venda)}
                        </td>
                        <td className="p-3 font-mono text-slate-700">
                          {v.codigo || v.id}
                        </td>
                        <td className="p-3 text-slate-600">{v.status}</td>
                        <td className="p-3 text-xs text-slate-500">
                          {v.itens.length}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-800">
                          {formatMoney(v.total)}
                        </td>
                      </tr>
                    ))}
                    {selectedDetails.historicoCompras.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
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
    </div>
  );
}
