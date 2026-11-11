"""Classement du championnat du monde « Sprint ».

On ne garde que les courses sprint (sprint-race-results.yml de f1db) et on
additionne les points réellement distribués lors de ces sprints (3-2-1 en 2021,
8 à 1 depuis 2022). Le champion sprint est le premier de ce classement.

Départage des égalités, comme dans le classement officiel (règlement sportif
FIA) : on compare le nombre de 1res places en sprint, puis de 2es places, puis
de 3es places, etc. Seules les arrivées classées (position numérique) comptent.
Si l'égalité persiste après tout le décompte (cas très improbable, tranché par
la FIA dans le règlement), on retient le pilote qui a obtenu en premier son
meilleur résultat, puis l'ordre alphabétique pour rester déterministe.

Sorties :
  docs/data/<année>/sprint.csv   (+ .hash)  une ligne par pilote, une colonne par sprint
  docs/data/sprint/index.json               années ayant eu des sprints + champion
"""
import csv
import glob
import hashlib
import json
import os
from collections import defaultdict

import yaml


def load_yaml(file_path):
    if not os.path.exists(file_path):
        return None
    with open(file_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def get_file_hash(file_path):
    if not os.path.exists(file_path):
        return None
    with open(file_path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def get_available_years(yaml_dir):
    seasons_dir = f"{yaml_dir}/seasons"
    if not os.path.exists(seasons_dir):
        print(f"Erreur : Le dossier {seasons_dir} n'existe pas.")
        return []
    return sorted(d for d in os.listdir(seasons_dir)
                  if os.path.isdir(os.path.join(seasons_dir, d)) and d.isdigit())


def load_driver_names(yaml_dir):
    names = {}
    for driver_file in glob.glob(f"{yaml_dir}/drivers/*.yml"):
        driver_id = os.path.basename(driver_file)[:-len('.yml')]
        data = load_yaml(driver_file)
        if data:
            names[driver_id] = data.get('name', driver_id)
    return names


def list_sprints(yaml_dir, year):
    """[(numéro de manche, dossier du GP, fichier résultats)] dans l'ordre du calendrier."""
    out = []
    for circuit in sorted(os.listdir(f"{yaml_dir}/seasons/{year}/races")):
        path = f"{yaml_dir}/seasons/{year}/races/{circuit}/sprint-race-results.yml"
        if os.path.exists(path):
            out.append((circuit, path))
    return out


def event_labels(sprints):
    """Étiquettes de colonnes uniques : 3 premières lettres du GP + 'S' (comme les qualifs)."""
    labels, used = [], set()
    for circuit, _ in sprints:
        gp = circuit.split('-', 1)[1].replace('-', '')
        label = f"{gp[:3].upper()}S"
        n = 2
        while label in used:
            label = f"{gp[:3].upper()}{n}S"
            n += 1
        used.add(label)
        labels.append(label)
    return labels


def to_number(value):
    try:
        return float(value) if value is not None else 0
    except (TypeError, ValueError):
        return 0


def rank_drivers(stats):
    """Trie les pilotes : points, puis décompte des arrivées (1res, 2es, ...), puis repli déterministe."""
    max_pos = max((p for s in stats.values() for p in s['finishes']), default=1)

    def key(item):
        driver_id, s = item
        countback = [-s['finishes'].get(p, 0) for p in range(1, max_pos + 1)]
        first_best = min(((p, i) for p, i in s['first_seen'].items()), default=(99, 99))
        return (-s['total'], countback, first_best, s['name'])

    return sorted(stats.items(), key=key)


def generate_sprint_csv(yaml_dir, year, driver_names, output_path, script_hash):
    sprints = list_sprints(yaml_dir, year)
    if not sprints:
        return None

    source_hash = hashlib.sha256(
        ''.join(get_file_hash(p) for _, p in sprints).encode()).hexdigest()
    hash_file = f"{output_path}.hash"
    if os.path.exists(output_path) and os.path.exists(hash_file):
        with open(hash_file, 'r') as f:
            prev = yaml.safe_load(f) or {}
        if prev.get('source_hash') == source_hash and prev.get('script_hash') == script_hash:
            return 'cache'

    labels = event_labels(sprints)
    stats = defaultdict(lambda: {'name': '', 'total': 0, 'events': {},
                                 'finishes': defaultdict(int), 'first_seen': {}})
    for index, (_, path) in enumerate(sprints):
        for result in load_yaml(path) or []:
            driver_id = result['driverId']
            s = stats[driver_id]
            s['name'] = driver_names.get(driver_id, driver_id)
            points = to_number(result.get('points'))
            s['total'] += points
            s['events'][labels[index]] = points
            position = result.get('position')
            if isinstance(position, int):
                s['finishes'][position] += 1
                s['first_seen'].setdefault(position, index)

    def fmt(n):
        return int(n) if float(n).is_integer() else n

    ranked = rank_drivers(stats)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Pilote', 'Rang', 'Points'] + labels)
        for rank, (_, s) in enumerate(ranked, 1):
            writer.writerow([s['name'], rank, fmt(s['total'])] +
                            [fmt(s['events'][l]) if l in s['events'] else '' for l in labels])
    with open(hash_file, 'w') as f:
        yaml.safe_dump({'source_hash': source_hash, 'script_hash': script_hash}, f)
    return 'generated'


def read_champion(csv_path):
    with open(csv_path, 'r', encoding='utf-8', newline='') as f:
        rows = list(csv.DictReader(f))
    return (rows[0]['Pilote'], rows[0]['Points']) if rows else ('', '')


if __name__ == "__main__":
    yaml_dir = "../../data/f1db/src/data"
    docs_data = "../../docs/data"

    script_hash = get_file_hash(__file__)
    driver_names = load_driver_names(yaml_dir)

    index = []
    counts = defaultdict(int)
    for year in get_available_years(yaml_dir):
        output_path = f"{docs_data}/{year}/sprint.csv"
        result = generate_sprint_csv(yaml_dir, year, driver_names, output_path, script_hash)
        if result is None:
            continue
        counts[result] += 1
        champion, points = read_champion(output_path)
        nb = len(list_sprints(yaml_dir, year))
        index.append({'year': year, 'sprints': nb, 'champion': champion, 'points': points})
        print(f"Classement sprint {year} ({nb} sprints) : {champion} ({points} pts) [{result}]")

    os.makedirs(f"{docs_data}/sprint", exist_ok=True)
    with open(f"{docs_data}/sprint/index.json", 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'years': index}, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f"Classement sprint généré : {counts['generated']} années, {counts['cache']} depuis le cache.")
