import openpyxl, sys
a, b = openpyxl.load_workbook(sys.argv[1]), openpyxl.load_workbook(sys.argv[2])
print("fogli", a.sheetnames == b.sheetnames)
d = 0
for wa in a.worksheets:
    wb = b[wa.title]
    for row in wa.iter_rows():
        for c in row:
            o = wb[c.coordinate]
            v1, v2 = c.value, o.value
            if hasattr(v1, "text"): v1 = v1.text
            if hasattr(v2, "text"): v2 = v2.text
            if v1 != v2 or c.number_format != o.number_format:
                d += 1
                if d < 6: print(wa.title, c.coordinate, repr(v1), repr(v2), c.number_format, o.number_format)
    if wa.max_row != wb.max_row or wa.max_column != wb.max_column: print("dim", wa.title, wa.dimensions, wb.dimensions)
print("differenze", d)
