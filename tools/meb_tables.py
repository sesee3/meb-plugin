import csv
import curses
import json
import os
import subprocess
import tempfile
from typing import Any, Dict, List, Set, Tuple

import matplotlib.pyplot as plt
import numpy as np


def load_file(path: str) -> List[Dict[str, Any]]:
    
    """_summary_

    Raises:
        FileNotFoundError: _description_

    Returns:
        _type_: _description_
    """
    
    if not os.path.exists(path):
        raise FileNotFoundError(f"File non trovato: {path}")

    lower = path.lower()

    if lower.endswith(".csv"):
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return [row for row in reader]

    if lower.endswith(".json"):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            out = []
            for item in data:
                if isinstance(item, dict):
                    out.append(item)
                else:
                    out.append({"value": item})
            return out
        if isinstance(data, dict):
            return [data]
        return [{"value": data}]

    with open(path, encoding="utf-8") as f:
        text = f.read().lstrip()
    if text.startswith("{") or text.startswith("["):
        data = json.loads(text)
        if isinstance(data, list):
            return [x if isinstance(x, dict) else {"value": x} for x in data]
        if isinstance(data, dict):
            return [data]
        return [{"value": data}]

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [row for row in reader]


def compute_column_widths(
    rows: List[Dict[str, Any]],
    columns: List[str],
    max_col_width: int = 60,
) -> Dict[str, int]:
    widths = {col: len(col) for col in columns}
    for r in rows:
        for col in columns:
            val = r.get(col, "")
            s = "" if val is None else str(val)
            if len(s) > max_col_width:
                s = s[:max_col_width]
            widths[col] = max(widths[col], len(s))
    return widths


def layout_columns(
    columns: List[str],
    widths: Dict[str, int],
    term_width: int,
    col_offset: int,
) -> Tuple[List[str], int]:
    visible: List[str] = []
    used = 0
    i = col_offset
    n = len(columns)
    while i < n:
        col = columns[i]
        w = widths[col] + 2  # spazi ai lati
        if used + w <= term_width - 1 or not visible:
            visible.append(col)
            used += w
            i += 1
        else:
            break
    return visible, used


def draw_table(stdscr, rows: List[Dict[str, Any]], columns: List[str]) -> None:
    curses.curs_set(0)
    stdscr.nodelay(False)
    stdscr.keypad(True)

    if not rows:
        stdscr.addstr(0, 0, "Nessuna riga da mostrare. Premi un tasto per uscire.")
        stdscr.getch()
        return

    col_widths = compute_column_widths(rows, columns)

    selected = 0
    top = 0
    col_offset = 0
    pinned_rows: Set[int] = set()
    
    def show_stats_menu():
        """Mostra menu statistiche per la colonna selezionata"""
        stdscr.clear()
        stdscr.addstr(0, 0, "=== MENU STATISTICHE ===", curses.A_BOLD)
        stdscr.addstr(2, 0, "Scegli una colonna per le statistiche:")
        for i, col in enumerate(columns):
            stdscr.addstr(3 + i, 2, f"{i+1}. {col}")
        stdscr.addstr(len(columns) + 4, 0, "Premi numero colonna o ESC per tornare")
        stdscr.refresh()
        
        key = stdscr.getch()
        if ord('1') <= key <= ord('9'):
            idx = key - ord('1')
            if idx < len(columns):
                compute_stats(stdscr, rows, columns[idx])
    
    def compute_stats(stdscr, rows, col_name):
        """Calcola e mostra statistiche per una colonna"""
        values = []
        for r in rows:
            val = r.get(col_name)
            if val is not None:
                try:
                    values.append(float(val))
                except (ValueError, TypeError):
                    pass
        
        stdscr.clear()
        stdscr.addstr(0, 0, f"=== STATISTICHE: {col_name} ===", curses.A_BOLD)
        
        if not values:
            stdscr.addstr(2, 0, "Nessun valore numerico trovato.")
        else:
            values.sort()
            n = len(values)
            mean = sum(values) / n
            median = values[n // 2] if n % 2 else (values[n//2-1] + values[n//2]) / 2
            
            stdscr.addstr(2, 0, f"Count:   {n}")
            stdscr.addstr(3, 0, f"Min:     {min(values):.4f}")
            stdscr.addstr(4, 0, f"Max:     {max(values):.4f}")
            stdscr.addstr(5, 0, f"Mean:    {mean:.4f}")
            stdscr.addstr(6, 0, f"Median:  {median:.4f}")
        
        stdscr.addstr(8, 0, "Premi un tasto per tornare...")
        stdscr.refresh()
        stdscr.getch()
    
    def open_plot_window():
        """Apre finestra grafico per colonna scelta"""
                
        stdscr.clear()
        stdscr.addstr(0, 0, "=== GRAFICO TEMPORALE ===", curses.A_BOLD)
        stdscr.addstr(2, 0, "Scegli colonna TEMPO/X-axis (es. timestamp):")
        for i, col in enumerate(columns):
            if i < 9:  # limita a 9 per semplicità
                stdscr.addstr(3 + i, 2, f"{i+1}. {col}")
        stdscr.refresh()
        
        key_x = stdscr.getch()
        if not (ord('1') <= key_x <= ord('9')):
            return
        idx_x = key_x - ord('1')
        if idx_x >= len(columns):
            return
        col_x = columns[idx_x]
        
        stdscr.clear()
        stdscr.addstr(0, 0, f"X-axis: {col_x}", curses.A_BOLD)
        stdscr.addstr(2, 0, "Scegli colonna VALORE/Y-axis:")
        for i, col in enumerate(columns):
            if i < 9:
                stdscr.addstr(3 + i, 2, f"{i+1}. {col}")
        stdscr.refresh()
        
        key_y = stdscr.getch()
        if not (ord('1') <= key_y <= ord('9')):
            return
        idx_y = key_y - ord('1')
        if idx_y >= len(columns):
            return
        col_y = columns[idx_y]
        

        x_vals = []
        y_vals = []
        for r in rows:
            x = r.get(col_x)
            y = r.get(col_y)
            if x is not None and y is not None:
                try:
                    y_vals.append(float(y))
                    x_vals.append(x)
                except (ValueError, TypeError):
                    pass
        
        if not x_vals:
            stdscr.clear()
            stdscr.addstr(0, 0, "Nessun dato valido trovato.")
            stdscr.addstr(2, 0, "Premi un tasto...")
            stdscr.refresh()
            stdscr.getch()
            return
        

        try:
            plt.figure(figsize=(12, 7))
            plt.plot(range(len(y_vals)), y_vals, marker='o', linestyle='-', markersize=4, linewidth=1.5)
            plt.xlabel(col_x, fontsize=12)
            plt.ylabel(col_y, fontsize=12)
            plt.title(f"{col_y} nel tempo", fontsize=14, fontweight='bold')
            plt.grid(True, alpha=0.3)
            plt.tight_layout()
            plt.show()
            plt.close()
            
        except Exception as e:
            stdscr.clear()
            stdscr.addstr(0, 0, f"Errore creazione grafico: {str(e)}")
            stdscr.addstr(2, 0, "Premi un tasto...")
            stdscr.refresh()
            stdscr.getch()

    while True:
        stdscr.erase()
        height, width = stdscr.getmaxyx()
        usable_height = max(1, height - 3)  # header + help + pinned

        visible_cols, _ = layout_columns(columns, col_widths, width, col_offset)

        # Header
        x = 0
        for col in visible_cols:
            w = col_widths[col]
            header = col[:w].ljust(w)
            stdscr.addstr(0, x, " " + header + " ", curses.A_REVERSE)
            x += w + 2

        # Righe pinnate in alto
        line_offset = 1
        pinned_list = sorted(pinned_rows)
        for pin_idx in pinned_list:
            if pin_idx >= len(rows):
                continue
            row = rows[pin_idx]
            x = 0
            for col in visible_cols:
                w = col_widths[col]
                val = "" if row.get(col) is None else str(row.get(col))
                val = val[:w].ljust(w)
                attr = curses.A_BOLD | curses.color_pair(1) if curses.has_colors() else curses.A_BOLD
                try:
                    stdscr.addstr(line_offset, x, " " + val + " ", attr)
                except:
                    pass
                x += w + 2
            line_offset += 1

        # Scrolling normale
        if selected < top:
            top = selected
        available = usable_height - len(pinned_list)
        if available < 1:
            available = 1
        if selected >= top + available:
            top = selected - available + 1

        for i in range(available):
            row_idx = top + i
            if row_idx >= len(rows):
                break
            if row_idx in pinned_rows:
                continue
            row = rows[row_idx]
            x = 0
            for col in visible_cols:
                w = col_widths[col]
                val = "" if row.get(col) is None else str(row.get(col))
                val = val[:w].ljust(w)
                attr = curses.A_STANDOUT if row_idx == selected else curses.A_NORMAL
                try:
                    stdscr.addstr(line_offset + i, x, " " + val + " ", attr)
                except:
                    pass
                x += w + 2

        # Pannello dei comandi
        help_text = (
            "↑/↓:muovi | ←/→:scroll col | PgUp/PgDn:pagina | P:pin | G:grafico | S:stats | Q:esci"
        )
        try:
            stdscr.addstr(height - 1, 0, help_text[: width - 1], curses.A_DIM)
        except:
            pass

        stdscr.refresh()

        key = stdscr.getch()
        if key in (ord("q"), ord("Q"), 27):
            break
        elif key in (curses.KEY_UP, ord("k")):
            if selected > 0:
                selected -= 1
        elif key in (curses.KEY_DOWN, ord("j")):
            if selected < len(rows) - 1:
                selected += 1
        elif key == curses.KEY_LEFT:
            if col_offset > 0:
                col_offset -= 1
        elif key == curses.KEY_RIGHT:
            if col_offset < max(0, len(columns) - 1):
                col_offset += 1
        elif key == curses.KEY_NPAGE:
            selected = min(len(rows) - 1, selected + usable_height)
        elif key == curses.KEY_PPAGE:
            selected = max(0, selected - usable_height)
        elif key in (ord('p'), ord('P')):
            if selected in pinned_rows:
                pinned_rows.remove(selected)
            else:
                pinned_rows.add(selected)
        elif key in (ord('g'), ord('G')):
            open_plot_window()
        elif key in (ord('s'), ord('S')):
            show_stats_menu()
        elif key == curses.KEY_RESIZE:
            pass


def normalize_columns(rows: List[Dict[str, Any]]) -> List[str]:
    seen: List[str] = []
    for r in rows:
        for k in r.keys():
            if k not in seen:
                seen.append(k)
    if not seen:
        seen.append("value")
    return seen


def main() -> None:
    try:
        path = input("Inserisci il percorso del file CSV o JSON: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\nAnnullato")
        return

    if not path:
        print("Nessun percorso fornito")
        return

    try:
        rows = load_file(path)
    except Exception as e:
        print(f"Errore durante il caricamento: {e}")
        return

    columns = normalize_columns(rows)

    # Inizializza colori se disponibili
    try:
        curses.wrapper(lambda stdscr: init_colors(stdscr) or draw_table(stdscr, rows, columns))
    except Exception as e:
        print(f"Errore nell'interfaccia curses: {e}")


def init_colors(stdscr):
    """Inizializza i colori per curses"""
    if curses.has_colors():
        curses.start_color()
        curses.init_pair(1, curses.COLOR_YELLOW, curses.COLOR_BLACK)
    return None


if __name__ == "__main__":
    main()

