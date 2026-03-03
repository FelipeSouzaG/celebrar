import { FormEvent, useEffect, useState } from "react";
import { adminApi } from "./api";
import { Icons } from "./components/Icons";
import { Modal } from "./components/Shared"; // Import Modal
import { ClientesTab } from "./tabs/ClientesTab";
import { ComprasTab } from "./tabs/ComprasTab";
import { FinanceiroTab } from "./tabs/FinanceiroTab";
import { FornecedoresTab } from "./tabs/FornecedoresTab";
import { ProdutosTab } from "./tabs/ProdutosTab";
import { UsuariosTab } from "./tabs/UsuariosTab";
import { VendaDiretaTab } from "./tabs/VendaDiretaTab";
import { VendasTab } from "./tabs/VendasTab";
import { Role } from "./types";

type TabKey =
  | "produtos"
  | "venda_direta"
  | "compras"
  | "vendas"
  | "clientes"
  | "fornecedores"
  | "financeiro"
  | "usuarios";

const tabs: Array<{
  key: TabKey;
  label: string;
  icon: any;
  adminOnly?: boolean;
}> = [
  { key: "produtos", label: "Produtos", icon: Icons.Product },
  { key: "venda_direta", label: "Venda Direta", icon: Icons.Plus },
  { key: "vendas", label: "Vendas (Caixa)", icon: Icons.Receipt },
  { key: "compras", label: "Compras", icon: Icons.ShoppingBag },
  { key: "financeiro", label: "Caixa Geral", icon: Icons.Cash },
  { key: "clientes", label: "Clientes", icon: Icons.Client },
  { key: "fornecedores", label: "Fornecedores", icon: Icons.Supplier },
  { key: "usuarios", label: "Usuários", icon: Icons.User, adminOnly: true },
];

export function App() {
  const [authState, setAuthState] = useState<
    "checking" | "logged_out" | "logged_in"
  >("checking");
  const [activeTab, setActiveTab] = useState<TabKey>("produtos");
  const [me, setMe] = useState<{ id: string; role: Role; name: string } | null>(
    null,
  );

  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Profile Modal State
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    nome: "",
    login: "",
    senha: "",
  });

  useEffect(() => {
    const user = adminApi.getStoredUser();

    // CORREÇÃO: Aceita ADMIN ou GERENTE
    if (!user || (user.role !== "ADMIN" && user.role !== "GERENTE")) {
      setAuthState("logged_out");
    } else {
      setMe({ id: user.id, role: user.role, name: user.name });
      setAuthState("logged_in");
    }
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const user = await adminApi.login(login, senha);

      // CORREÇÃO: Validação explicita dos cargos permitidos no Admin
      if (user.role !== "ADMIN" && user.role !== "GERENTE") {
        throw new Error("Acesso restrito a Gerentes e Administradores.");
      }

      setMe({ id: user.id, role: user.role, name: user.name });
      setAuthState("logged_in");
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    adminApi.logout();
    setAuthState("logged_out");
  };

  const openProfileModal = () => {
    // Pre-fill with known data (login cannot be retrieved from token easily if not stored,
    // assume login needs input or fetch from full profile api if available.
    // For now we pre-fill name and empty login/password for security/simplicity unless we stored login)
    // Since `getStoredUser` doesn't strictly store 'login', user has to re-type login to change it or we just show name.
    // Better UX: Let's assume user knows their login or just wants to change Name/Pwd.
    setProfileForm({ nome: me?.name || "", login: "", senha: "" });
    setProfileModalOpen(true);
  };

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    try {
      // If login is empty, don't send it or send current if we knew it.
      // The API expects login. Since we don't have it in state `me`,
      // enforcing the user to re-enter their login to update profile is a good security check.
      if (!profileForm.login)
        return alert("Confirme seu login atual (ou o novo) para salvar.");

      const updated = await adminApi.updateProfile(profileForm);
      setMe({ id: updated.id, role: updated.role, name: updated.nome });
      setProfileModalOpen(false);
      alert("Perfil atualizado com sucesso!");
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (authState === "logged_out")
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
          <h1 className="text-3xl font-bold text-slate-900 text-center mb-8">
            Celebrar Admin
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              className="w-full px-4 py-3 rounded-lg border border-slate-300 outline-none"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Usuário"
            />
            <input
              className="w-full px-4 py-3 rounded-lg border border-slate-300 outline-none"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Senha"
            />
            {authError && (
              <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center">
                {authError}
              </div>
            )}
            <button
              disabled={authLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors"
            >
              {authLoading ? "Verificando..." : "Acessar Painel"}
            </button>
          </form>
        </div>
      </div>
    );

  const isFullLayout = [
    "financeiro",
    "produtos",
    "compras",
    "fornecedores",
    "vendas",
    "venda_direta",
    "clientes",
  ].includes(activeTab);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-2xl z-20">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Celebrar Festas
          </h2>
          <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wider mt-1">
            Gestão de Cadastros
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {tabs.map((t) => {
            // Oculta abas exclusivas de Admin se for Gerente
            if (t.adminOnly && me?.role !== "ADMIN") return null;

            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === t.key ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/50 translate-x-1" : "hover:bg-slate-800 hover:text-white"}`}
              >
                <t.icon /> {t.label}
              </button>
            );
          })}
        </nav>

        {/* USER PROFILE CARD */}
        <div className="p-4 border-t border-slate-800 bg-slate-900">
          <div className="bg-slate-800 rounded-xl p-3 mb-3 flex items-center justify-between group hover:bg-slate-750 transition-colors">
            <div className="flex items-center gap-3 overflow-hidden">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-lg ${me?.role === "ADMIN" ? "bg-gradient-to-br from-purple-500 to-indigo-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}`}
              >
                {me?.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-white truncate">
                  {me?.name?.split(" ")[0]}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  {me?.role}
                </span>
              </div>
            </div>
            <button
              onClick={openProfileModal}
              className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition-all"
              title="Editar Perfil"
            >
              <Icons.Settings />
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-rose-400 hover:text-rose-300 hover:bg-rose-900/20 rounded-lg transition-colors border border-rose-900/30"
          >
            <Icons.Logout /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Default Header - Hidden on Full Layout Tabs */}
        {!isFullLayout && (
          <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center shadow-sm z-10">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-slate-800">
                {tabs.find((t) => t.key === activeTab)?.label}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end mr-2">
                <span className="text-xs font-bold text-slate-500 uppercase">
                  {me?.role === "ADMIN" ? "Administrador" : "Gerente"}
                </span>
              </div>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${me?.role === "ADMIN" ? "bg-purple-600" : "bg-indigo-600"}`}
              >
                {me?.role[0]}
              </div>
            </div>
          </header>
        )}

        {/* Content Area - No padding for Full Layout Tabs */}
        <div
          className={`flex-1 overflow-y-auto ${isFullLayout ? "p-0" : "p-8"} scroll-smooth`}
        >
          <div
            className={
              isFullLayout ? "" : "max-w-screen-2xl mx-auto animate-fadeIn"
            }
          >
            {activeTab === "produtos" && <ProdutosTab />}
            {activeTab === "venda_direta" && <VendaDiretaTab />}
            {activeTab === "compras" && <ComprasTab />}
            {activeTab === "vendas" && <VendasTab />}
            {activeTab === "financeiro" && <FinanceiroTab />}
            {activeTab === "clientes" && <ClientesTab />}
            {activeTab === "fornecedores" && <FornecedoresTab />}
            {activeTab === "usuarios" && me?.role === "ADMIN" && (
              <UsuariosTab />
            )}
          </div>
        </div>
      </main>

      {/* MODAL MINHA CONTA */}
      <Modal
        open={profileModalOpen}
        title="Minha Conta"
        onClose={() => setProfileModalOpen(false)}
      >
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-2xl text-white shadow-lg ${me?.role === "ADMIN" ? "bg-gradient-to-br from-purple-500 to-indigo-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}`}
            >
              {me?.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <h4 className="font-bold text-slate-800">Editando Perfil</h4>
              <p className="text-xs text-slate-500">
                Atualize seus dados de acesso.
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Seu Nome
            </label>
            <input
              className="w-full p-2.5 border rounded-lg"
              value={profileForm.nome}
              onChange={(e) =>
                setProfileForm({ ...profileForm, nome: e.target.value })
              }
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Login (Usuário)
            </label>
            <input
              className="w-full p-2.5 border rounded-lg"
              value={profileForm.login}
              onChange={(e) =>
                setProfileForm({ ...profileForm, login: e.target.value })
              }
              required
              placeholder="Confirme seu login..."
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Para sua segurança, confirme o login atual ou digite um novo para
              alterar.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">
              Nova Senha
            </label>
            <input
              className="w-full p-2.5 border rounded-lg"
              type="password"
              value={profileForm.senha}
              onChange={(e) =>
                setProfileForm({ ...profileForm, senha: e.target.value })
              }
              placeholder="Deixe em branco para não alterar"
            />
          </div>

          <div className="pt-2">
            <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-indigo-500/20">
              Salvar Alterações
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
