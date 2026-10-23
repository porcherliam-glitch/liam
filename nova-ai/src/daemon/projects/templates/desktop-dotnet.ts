// Template "desktop-dotnet" – Windows desktop application with WPF on .NET 8 plus an xUnit test project.
// Key decisions:
// - Three projects in one solution: src/<Id> (WPF, net8.0-windows, WinExe), src/<Id>.Core (net8.0 class library with
//   the logic) and tests/<Id>.Core.Tests (xUnit, net8.0). Tests therefore run on any OS; the WPF app runs on Windows
//   only (EnableWindowsTargeting lets the solution build elsewhere).
// - NuGet packages (xUnit, test SDK) are restored at build time by `dotnet restore/build/test` – nothing is downloaded
//   while scaffolding. CheckService runs `dotnet restore` first when obj/ is missing (install-first rule).
// - C#, XAML, .csproj and .sln files use CRLF (writeScaffold). Preview kind desktop-run (`dotnet run`).
import { randomUUID } from 'node:crypto';
import type { ProjectTemplate } from '../../contracts';
import { emptyCommands } from '../config';
import { GITIGNORE_COMMON, HONEST_LIMITS_DE, csharpIdentifier, markdownParagraph, writeScaffold, xmlEscape, type ScaffoldFiles } from './common';

const CSHARP_PROJECT_TYPE = '{9A19103F-16F7-4668-BE54-9A1E7A4F7556}';
const RESERVED_IDS = new Set(['App', 'MainWindow', 'NoteBook', 'System', 'Microsoft', 'Xunit', 'Tests', 'Core']);

export function dotnetIdentifier(name: string): string {
  let id = csharpIdentifier(name, 'NovaApp');
  if (RESERVED_IDS.has(id)) id = `${id}App`;
  return id;
}

function guid(): string {
  return `{${randomUUID().toUpperCase()}}`;
}

function solution(id: string): string {
  const app = guid();
  const core = guid();
  const tests = guid();
  const srcFolder = guid();
  const testsFolder = guid();
  const folderType = '{2150E333-8FDC-42A3-9474-1A3956D46DE8}';
  const projects: [string, string, string][] = [
    [app, id, `src\\${id}\\${id}.csproj`],
    [core, `${id}.Core`, `src\\${id}.Core\\${id}.Core.csproj`],
    [tests, `${id}.Core.Tests`, `tests\\${id}.Core.Tests\\${id}.Core.Tests.csproj`],
  ];
  const lines: string[] = ['', 'Microsoft Visual Studio Solution File, Format Version 12.00', '# Visual Studio Version 17', 'VisualStudioVersion = 17.0.31903.59', 'MinimumVisualStudioVersion = 10.0.40219.1'];
  for (const [g, n, p] of projects) {
    lines.push(`Project("${CSHARP_PROJECT_TYPE}") = "${n}", "${p}", "${g}"`, 'EndProject');
  }
  lines.push(`Project("${folderType}") = "src", "src", "${srcFolder}"`, 'EndProject');
  lines.push(`Project("${folderType}") = "tests", "tests", "${testsFolder}"`, 'EndProject');
  lines.push('Global', '\tGlobalSection(SolutionConfigurationPlatforms) = preSolution', '\t\tDebug|Any CPU = Debug|Any CPU', '\t\tRelease|Any CPU = Release|Any CPU', '\tEndGlobalSection');
  lines.push('\tGlobalSection(ProjectConfigurationPlatforms) = postSolution');
  for (const [g] of projects) {
    lines.push(`\t\t${g}.Debug|Any CPU.ActiveCfg = Debug|Any CPU`, `\t\t${g}.Debug|Any CPU.Build.0 = Debug|Any CPU`, `\t\t${g}.Release|Any CPU.ActiveCfg = Release|Any CPU`, `\t\t${g}.Release|Any CPU.Build.0 = Release|Any CPU`);
  }
  lines.push('\tEndGlobalSection', '\tGlobalSection(SolutionProperties) = preSolution', '\t\tHideSolutionNode = FALSE', '\tEndGlobalSection');
  lines.push('\tGlobalSection(NestedProjects) = preSolution', `\t\t${app} = ${srcFolder}`, `\t\t${core} = ${srcFolder}`, `\t\t${tests} = ${testsFolder}`, '\tEndGlobalSection');
  lines.push('EndGlobal', '');
  return lines.join('\n');
}

function appCsproj(id: string): string {
  return `<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWPF>true</UseWPF>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <!-- Erlaubt das Bauen auch außerhalb von Windows (Starten nur unter Windows). -->
    <EnableWindowsTargeting>true</EnableWindowsTargeting>
    <RootNamespace>${id}</RootNamespace>
    <AssemblyName>${id}</AssemblyName>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\\${id}.Core\\${id}.Core.csproj" />
  </ItemGroup>

</Project>
`;
}

function coreCsproj(id: string): string {
  return `<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace>${id}.Core</RootNamespace>
  </PropertyGroup>

</Project>
`;
}

function testsCsproj(id: string): string {
  return `<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
    <IsTestProject>true</IsTestProject>
    <RootNamespace>${id}.Core.Tests</RootNamespace>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2">
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
      <PrivateAssets>all</PrivateAssets>
    </PackageReference>
  </ItemGroup>

  <ItemGroup>
    <Using Include="Xunit" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\\..\\src\\${id}.Core\\${id}.Core.csproj" />
  </ItemGroup>

</Project>
`;
}

function noteBook(id: string): string {
  return `namespace ${id}.Core;

/// <summary>Ein Eintrag der Notizliste.</summary>
public sealed record Note(int Id, string Text, bool Done);

/// <summary>
/// Logik der Notizliste ohne Oberfläche (dadurch mit xUnit testbar, auch außerhalb von Windows).
/// </summary>
public sealed class NoteBook
{
    public const int MaxLength = 200;

    private readonly List<Note> notes = new();
    private int nextId = 1;

    public IReadOnlyList<Note> Notes => notes;

    public int OpenCount => notes.Count(n => !n.Done);

    /// <summary>Fügt eine Notiz hinzu. Leere oder zu lange Texte werden mit einer deutschen Meldung abgelehnt.</summary>
    public Note Add(string? text)
    {
        var value = Normalize(text);
        var note = new Note(nextId++, value, false);
        notes.Add(note);
        return note;
    }

    public bool Toggle(int id)
    {
        var index = notes.FindIndex(n => n.Id == id);
        if (index < 0)
        {
            return false;
        }

        notes[index] = notes[index] with { Done = !notes[index].Done };
        return true;
    }

    public bool Remove(int id) => notes.RemoveAll(n => n.Id == id) > 0;

    public int ClearDone() => notes.RemoveAll(n => n.Done);

    public static string Normalize(string? text)
    {
        var value = string.Join(' ', (text ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (value.Length == 0)
        {
            throw new ArgumentException("Bitte einen Text eingeben.", nameof(text));
        }

        if (value.Length > MaxLength)
        {
            throw new ArgumentException($"Der Text darf höchstens {MaxLength} Zeichen lang sein.", nameof(text));
        }

        return value;
    }
}
`;
}

function noteBookTests(id: string): string {
  return `using ${id}.Core;

namespace ${id}.Core.Tests;

public class NoteBookTests
{
    [Fact]
    public void Add_TrimsAndStoresText()
    {
        var book = new NoteBook();
        var note = book.Add("  Milch   kaufen ");
        Assert.Equal("Milch kaufen", note.Text);
        Assert.Single(book.Notes);
        Assert.Equal(1, book.OpenCount);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Add_RejectsEmptyText(string? text)
    {
        var book = new NoteBook();
        Assert.Throws<ArgumentException>(() => book.Add(text));
    }

    [Fact]
    public void Add_RejectsTooLongText()
    {
        Assert.Throws<ArgumentException>(() => new NoteBook().Add(new string('x', NoteBook.MaxLength + 1)));
    }

    [Fact]
    public void Toggle_Remove_ClearDone()
    {
        var book = new NoteBook();
        var a = book.Add("A");
        var b = book.Add("B");
        Assert.True(book.Toggle(a.Id));
        Assert.Equal(1, book.OpenCount);
        Assert.False(book.Toggle(999));
        Assert.Equal(1, book.ClearDone());
        Assert.Equal(new[] { "B" }, book.Notes.Select(n => n.Text));
        Assert.True(book.Remove(b.Id));
        Assert.Empty(book.Notes);
    }
}
`;
}

function appXaml(id: string): string {
  return `<Application x:Class="${id}.App"
             xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
             StartupUri="MainWindow.xaml">
    <Application.Resources>
    </Application.Resources>
</Application>
`;
}

function appXamlCs(id: string): string {
  return `using System.Windows;

namespace ${id};

/// <summary>Einstiegspunkt der Anwendung.</summary>
public partial class App : Application
{
}
`;
}

function mainWindowXaml(id: string, name: string): string {
  return `<Window x:Class="${id}.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="${xmlEscape(name)}" Height="460" Width="560"
        Background="#0B0B14" Foreground="#E6E6F0" FontFamily="Segoe UI" FontSize="14">
    <Grid Margin="16">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto" />
            <RowDefinition Height="Auto" />
            <RowDefinition Height="Auto" />
            <RowDefinition Height="*" />
            <RowDefinition Height="Auto" />
        </Grid.RowDefinitions>

        <TextBlock Grid.Row="0" Text="${xmlEscape(name)}" FontSize="22" FontWeight="SemiBold" Foreground="#A78BFA" Margin="0,0,0,12" />

        <DockPanel Grid.Row="1">
            <Button x:Name="AddButton" DockPanel.Dock="Right" Content="Hinzufügen" Padding="12,4" Margin="8,0,0,0" Click="OnAdd" IsDefault="True" />
            <TextBox x:Name="NoteInput" MaxLength="200" Padding="6,4" />
        </DockPanel>

        <TextBlock Grid.Row="2" x:Name="ErrorText" Foreground="#F87171" Margin="0,6,0,0" Visibility="Collapsed" />

        <ListBox Grid.Row="3" x:Name="NoteList" Margin="0,12,0,12" Background="#14142A" Foreground="#E6E6F0" BorderBrush="#2C2C52">
            <ListBox.ItemTemplate>
                <DataTemplate>
                    <DockPanel LastChildFill="True">
                        <Button DockPanel.Dock="Right" Content="Löschen" Margin="8,0,0,0" Padding="8,2" Tag="{Binding Id}" Click="OnRemove" />
                        <CheckBox IsChecked="{Binding Done, Mode=OneWay}" Tag="{Binding Id}" Click="OnToggle" VerticalAlignment="Center" Margin="0,0,8,0" />
                        <TextBlock Text="{Binding Text}" TextWrapping="Wrap" VerticalAlignment="Center" />
                    </DockPanel>
                </DataTemplate>
            </ListBox.ItemTemplate>
        </ListBox>

        <DockPanel Grid.Row="4">
            <Button DockPanel.Dock="Right" Content="Erledigte entfernen" Padding="12,4" Click="OnClearDone" />
            <TextBlock x:Name="CountText" VerticalAlignment="Center" Foreground="#B9B9CC" />
        </DockPanel>
    </Grid>
</Window>
`;
}

function mainWindowCs(id: string): string {
  return `using System.Windows;
using System.Windows.Controls;
using ${id}.Core;

namespace ${id};

/// <summary>Hauptfenster: verbindet die Oberfläche mit der Logik in ${id}.Core.NoteBook.</summary>
public partial class MainWindow : Window
{
    private readonly NoteBook book = new();

    public MainWindow()
    {
        InitializeComponent();
        Refresh();
        NoteInput.Focus();
    }

    private void OnAdd(object sender, RoutedEventArgs e)
    {
        try
        {
            book.Add(NoteInput.Text);
            NoteInput.Clear();
            ShowError(null);
        }
        catch (ArgumentException ex)
        {
            ShowError(ex.Message.Split(" (Parameter")[0]);
        }

        Refresh();
    }

    private void OnToggle(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { Tag: int id })
        {
            book.Toggle(id);
            Refresh();
        }
    }

    private void OnRemove(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { Tag: int id })
        {
            book.Remove(id);
            Refresh();
        }
    }

    private void OnClearDone(object sender, RoutedEventArgs e)
    {
        book.ClearDone();
        Refresh();
    }

    private void ShowError(string? message)
    {
        ErrorText.Text = message ?? string.Empty;
        ErrorText.Visibility = string.IsNullOrEmpty(message) ? Visibility.Collapsed : Visibility.Visible;
    }

    private void Refresh()
    {
        NoteList.ItemsSource = null;
        NoteList.ItemsSource = book.Notes.ToList();
        CountText.Text = book.OpenCount == 1 ? "1 offen" : $"{book.OpenCount} offen";
    }
}
`;
}

const GITIGNORE_DOTNET = [GITIGNORE_COMMON, '# .NET', 'bin/', 'obj/', 'dist/', 'TestResults/', '.vs/', '*.user', '*.suo', '*.rsuser', ''].join('\n');

function readme(name: string, description: string, id: string): string {
  return `# ${name}

${description ? markdownParagraph(description) + '\n\n' : ''}Eine Windows-Desktop-Anwendung mit WPF und .NET 8. Als Startpunkt enthält sie eine kleine Notizliste. Die Logik liegt in
einer eigenen Bibliothek und ist mit xUnit getestet. Angelegt mit NOVA AI aus der Vorlage „Windows-Desktop-Anwendung“.

## Voraussetzungen

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) (z. B. \`winget install --id Microsoft.DotNet.SDK.8 -e\`)
- Beim ersten Bauen lädt \`dotnet\` die NuGet-Pakete (xUnit, Test-SDK) aus dem Internet.

## Befehle

| Zweck | Befehl |
|---|---|
| Pakete laden | \`dotnet restore ${id}.sln\` |
| Bauen | \`dotnet build ${id}.sln\` |
| Tests | \`dotnet test ${id}.sln\` |
| Starten | \`dotnet run --project src/${id}/${id}.csproj\` |
| Veröffentlichen | \`dotnet publish src/${id}/${id}.csproj -c Release -o dist\` |

## Aufbau

- \`src/${id}/\` – WPF-Oberfläche (\`MainWindow.xaml\`, \`App.xaml\`)
- \`src/${id}.Core/\` – Logik ohne Oberfläche (\`NoteBook.cs\`)
- \`tests/${id}.Core.Tests/\` – xUnit-Tests der Logik

## Grenzen (ehrlich)

- WPF-Anwendungen laufen nur unter Windows. Die Logik-Tests laufen überall, wo .NET 8 installiert ist.
- Die Vorschau in NOVA startet das Programm in einem eigenen Fenster; eine eingebettete Live-Vorschau gibt es für Desktop-Programme nicht.
- \`dotnet publish\` erzeugt einen Ordner mit der Anwendung, aber keinen Installer. Für die Weitergabe muss auf dem Zielrechner die .NET-8-Desktop-Runtime installiert sein (oder mit \`--self-contained\` veröffentlichen).
${HONEST_LIMITS_DE}
`;
}

export function createDesktopDotnetTemplate(): ProjectTemplate {
  return {
    info: {
      id: 'desktop-dotnet',
      name: 'Windows-Desktop-Anwendung (WPF, .NET 8)',
      description: 'Windows-Programm mit WPF und C# auf .NET 8, Logik-Bibliothek und xUnit-Tests – startet in einem eigenen Fenster.',
      kind: 'desktop',
      technologies: ['C#', '.NET 8', 'WPF', 'xUnit'],
      requiredTools: ['dotnet'],
      previewKind: 'desktop-run',
    },
    async scaffold(dir, opts) {
      const id = dotnetIdentifier(opts.name);
      const files: ScaffoldFiles = {
        [`${id}.sln`]: solution(id),
        [`src/${id}/${id}.csproj`]: appCsproj(id),
        [`src/${id}/App.xaml`]: appXaml(id),
        [`src/${id}/App.xaml.cs`]: appXamlCs(id),
        [`src/${id}/MainWindow.xaml`]: mainWindowXaml(id, opts.name),
        [`src/${id}/MainWindow.xaml.cs`]: mainWindowCs(id),
        [`src/${id}.Core/${id}.Core.csproj`]: coreCsproj(id),
        [`src/${id}.Core/NoteBook.cs`]: noteBook(id),
        [`tests/${id}.Core.Tests/${id}.Core.Tests.csproj`]: testsCsproj(id),
        [`tests/${id}.Core.Tests/NoteBookTests.cs`]: noteBookTests(id),
        'README.md': readme(opts.name, opts.description, id),
        '.gitignore': GITIGNORE_DOTNET,
      };
      const app = `src/${id}/${id}.csproj`;
      return {
        files: writeScaffold(dir, files),
        config: {
          commands: emptyCommands({
            install: `dotnet restore ${id}.sln`,
            build: `dotnet build ${id}.sln`,
            test: `dotnet test ${id}.sln`,
            run: `dotnet run --project ${app}`,
            dev: `dotnet run --project ${app}`,
            package: `dotnet publish ${app} -c Release -o dist`,
          }),
          preview: { kind: 'desktop-run', entry: null, url: null },
          artifactGlobs: ['dist/**'],
          conventions: `Logik gehört in src/${id}.Core (ohne WPF) und wird mit xUnit in tests/${id}.Core.Tests geprüft. Die WPF-Oberfläche in src/${id} bleibt dünn.`,
        },
        notes: [],
      };
    },
  };
}
