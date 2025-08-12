import { Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Keyboard, HelpCircle, Mail } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

const AppLayout = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/20 text-foreground pb-20">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
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

          <main className="flex-1 p-4 pb-6 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;