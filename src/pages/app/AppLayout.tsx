import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthContext } from "@/context/UserContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LayoutDashboard, Loader2, Mail, AlertTriangle, History, Settings, Search, Keyboard, HelpCircle, ChevronDown, LogOut } from "lucide-react";

const AppLayout = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { user } = useAuthContext();

  const onLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/20 text-foreground">
      <aside className="fixed left-0 top-0 h-full w-60 border-r bg-card">
        <div className="p-4 border-b">
          <Link to="/app" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/10 grid place-items-center text-primary">FB</div>
            <span className="font-bold">FakturBot</span>
          </Link>
        </div>
        <nav className="p-3 space-y-1">
          <Link to="/app" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent">
            <LayoutDashboard className="h-4 w-4" /> Dashboard <Badge className="ml-auto">28</Badge>
          </Link>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent">
            <Loader2 className="h-4 w-4" /> Processing <Badge variant="secondary" className="ml-auto">5</Badge>
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent">
            <AlertTriangle className="h-4 w-4" /> Failed <Badge variant="destructive" className="ml-auto">3</Badge>
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent">
            <History className="h-4 w-4" /> History
          </button>
          <Link to="/app/settings" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent">
            <Settings className="h-4 w-4" /> Settings
          </Link>
        </nav>
        <div className="absolute bottom-0 w-full p-3 border-t">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-muted" />
            <div className="text-sm">
              <div className="font-medium truncate">{user?.email ?? "Anna Kowalska"}</div>
              <div className="text-muted-foreground truncate text-xs">ACME Company</div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="User menu">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onLogout}>
                  <LogOut className="h-4 w-4 mr-2" /> Wyloguj
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      <div className="ml-60">
        <header className="h-14 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 w-72" placeholder="Szukaj faktur..." />
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="secondary">All</Button>
              <Button size="sm" variant="ghost"><Mail className="h-4 w-4 mr-1" />Gmail</Button>
              <Button size="sm" variant="ghost">Outlook</Button>
              <Button size="sm" variant="ghost">IMAP</Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts"><Keyboard className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Help"><HelpCircle className="h-4 w-4" /></Button>
          </div>
        </header>

        <main className="p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
