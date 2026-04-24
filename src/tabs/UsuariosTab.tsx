import { FormEvent, useEffect, useState } from "react";
import { adminApi } from "../api";
import { Icons } from "../components/Icons";
import { Modal, Table } from "../components/Shared";
import { Role, UsuarioAdmin } from "../types";

const emptyUsuarioForm: Partial<UsuarioAdmin> = {
  nome: "",
  login: "",
  senha: "",
  role: "OPERADOR",
};

export function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyUsuarioForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setUsuarios(await adminApi.getUsuarios());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) await adminApi.updateUsuario(editingId, form);
      else await adminApi.createUsuario(form);
      setModalOpen(false);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const openModal = (u?: UsuarioAdmin) => {
    setEditingId(u ? u.id : null);
    setForm(u ? { ...u, senha: "" } : emptyUsuarioForm);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir usuário?")) return;
    try {
      await adminApi.deleteUsuario(id);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const getRoleLabel = (role: Role) => {
    if (role === "ADMIN") return "Super Admin";
    if (role === "GERENTE") return "Gerente";
    return "Operador (Caixa)";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-slate-800">Controle de Acesso</h3>
        <button
          onClick={() => openModal()}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-bold flex gap-2"
        >
          <Icons.Plus /> Novo Usuário
        </button>
      </div>
      <Table headers={["Nome", "Login", "Permissão", "Ações"]}>
        {usuarios.map((u) => (
          <tr key={u.id} className="hover:bg-slate-50">
            <td className="px-6 py-4 font-bold">{u.nome}</td>
            <td className="px-6 py-4">{u.login}</td>
            <td className="px-6 py-4">
              <span
                className={`px-2 py-1 rounded text-xs font-bold ${u.role === "ADMIN" ? "bg-purple-100 text-purple-700" : u.role === "GERENTE" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"}`}
              >
                {getRoleLabel(u.role)}
              </span>
            </td>
            <td className="px-6 py-4 flex gap-2">
              <button
                onClick={() => openModal(u)}
                className="text-indigo-600 p-2 hover:bg-indigo-50 rounded"
              >
                <Icons.Edit />
              </button>
              <button
                onClick={() => handleDelete(u.id)}
                className="text-rose-500 p-2 hover:bg-rose-50 rounded"
              >
                <Icons.Trash />
              </button>
            </td>
          </tr>
        ))}
      </Table>

      <Modal
        open={modalOpen}
        title={editingId ? "Editar Usuário" : "Novo Usuário"}
        onClose={() => setModalOpen(false)}
      >
        <form className="space-y-4" onSubmit={handleSave}>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Nome Completo
            </label>
            <input
              className="w-full p-2 border rounded"
              placeholder="Nome"
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Login de Acesso
            </label>
            <input
              className="w-full p-2 border rounded"
              placeholder="Login"
              required
              value={form.login}
              onChange={(e) => setForm({ ...form, login: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Senha
            </label>
            <input
              className="w-full p-2 border rounded"
              type="password"
              placeholder={editingId ? "Senha (vazio para manter)" : "Senha"}
              required={!editingId}
              value={form.senha || ""}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Permissão
            </label>
            <select
              className="w-full p-2 border rounded bg-white"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as Role })
              }
            >
              <option value="OPERADOR">Operador (Caixa)</option>
              <option value="GERENTE">Gerente</option>
              {/* ADMIN removido propositalmente da interface */}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              O perfil de Administrador é gerenciado exclusivamente via sistema.
            </p>
          </div>
          <button className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold mt-2">
            Salvar
          </button>
        </form>
      </Modal>
    </div>
  );
}
