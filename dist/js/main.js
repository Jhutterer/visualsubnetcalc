let subnetMap = {};
let subnetNotes = {};
let maxNetSize = 0;
let infoColumnCount = 5
let isHydratingFromSnapshot = false;
let plannerSnapshotPersistPending = false;
let plannerVrfs = [{ id: 1, name: 'GLOBAL' }, { id: 2, name: 'MGMT' }];

if (typeof window !== 'undefined') {
    window.subnetMap = subnetMap;
}
// NORMAL mode:
//   - Smallest subnet: /32
//   - Two reserved addresses per subnet of size <= 30:
//     - Net+0 = Network Address
//     - Last = Broadcast Address
// AWS mode:
//   - Smallest subnet: /28
//   - Two reserved addresses per subnet:
//     - Net+0 = Network Address
//     - Net+1 = AWS Reserved - VPC Router
//     - Net+2 = AWS Reserved - VPC DNS
//     - Net+3 = AWS Reserved - Future Use
//     - Last = Broadcast Address
// Azure mode:
//   - Smallest subnet: /29
//   - Two reserved addresses per subnet:
//     - Net+0 = Network Address
//     - Net+1 = Reserved - Default Gateway
//     - Net+2 = Reserved - DNS Mapping
//     - Net+3 = Reserved - DNS Mapping
//     - Last = Broadcast Address
// OCI mode:
//   - Smallest subnet: /30
//   - Three reserved addresses per subnet:
//     - Net+0 = Network Address
//     - Net+1 = OCI Reserved - Default Gateway Address
//     - Last = Broadcast Address
let noteTimeout;
let operatingMode = 'Standard'
let previousOperatingMode = 'Standard'
let inflightColor = 'NONE'
let urlVersion = '1'
let configVersion = '2'

const netsizePatterns = {
    Standard: '^([12]?[0-9]|3[0-2])$',
    AZURE: '^([12]?[0-9])$',
    AWS: '^(1?[0-9]|2[0-8])$',
    OCI: '^([12]?[0-9]|30)$',
};

const minSubnetSizes = {
    Standard: 32,
    AZURE: 29,
    AWS: 28,
    OCI: 30,
};
$('input#network').on('paste', function (e) {
    let pastedData = window.event.clipboardData.getData('text')
    if (pastedData.includes('/')) {
        let [network, netSize] = pastedData.split('/')
        $('#network').val(network)
        $('#netsize').val(netSize)
    }
    e.preventDefault()
});

$("input#network").on('keydown', function (e) {
    if (e.key === '/') {
        e.preventDefault()
        $('input#netsize').focus().select()
    }
});

$('input#network,input#netsize').on('input', function() {
    $('#input_form')[0].classList.add('was-validated');
})
$('#color_palette div').on('click', function() {
    // We don't really NEED to convert this to hex, but it's really low overhead to do the
    // conversion here and saves us space in the export/save
    inflightColor = rgba2hex($(this).css('background-color'))
})
$('#calcbody').on('click', '.row_address, .row_range, .row_usable, .row_hosts, .note, input', function(event) {
    if (inflightColor !== 'NONE') {
        mutate_subnet_map('color', this.dataset.subnet, '', inflightColor)
        // We could re-render here, but there is really no point, keep performant and just change the background color now
        //renderTable();
        $(this).closest('tr').css('background-color', inflightColor)
    }
})
$('#btn_go').on('click', function() {
    $('#input_form').removeClass('was-validated');
    $('#input_form').validate();
    if ($('#input_form').valid()) {
        $('#input_form')[0].classList.add('was-validated');
        reset();
        // Additional actions upon validation can be added here
    } else {
        show_warning_modal('<div>Please correct the errors in the form!</div>');
    }
})
$('#dropdown_standard').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'Standard';
    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }
});

$('#dropdown_azure').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'AZURE';
    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }
});

$('#dropdown_aws').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'AWS';
    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }
});

$('#dropdown_oci').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'OCI';
    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }
});

$('#importBtn').on('click', function() {
    importConfig(JSON.parse($('#importExportArea').val()))
})
$('#bottom_nav #colors_word_open').on('click', function() {
    $('#bottom_nav #color_palette').removeClass('d-none');
    $('#bottom_nav #colors_word_close').removeClass('d-none');
    $('#bottom_nav #colors_word_open').addClass('d-none');
})
$('#bottom_nav #colors_word_close').on('click', function() {
    $('#bottom_nav #color_palette').addClass('d-none');
    $('#bottom_nav #colors_word_close').addClass('d-none');
    $('#bottom_nav #colors_word_open').removeClass('d-none');
    inflightColor = 'NONE'
})
$('#bottom_nav #copy_url').on('click', function() {
    // TODO: Provide a warning here if the URL is longer than 2000 characters, probably using a modal.
    let url = window.location.origin + getConfigUrl()
    navigator.clipboard.writeText(url);
    $('#bottom_nav #copy_url span').text('Copied!')
    // Swap the text back after 3sec
    setTimeout(function(){
        $('#bottom_nav #copy_url span').text('Copy Shareable URL')
    }, 2000)
})
$('#btn_import_export').on('click', function() {
    $('#importExportArea').val(JSON.stringify(exportConfig(false), null, 2))
})
function reset() {

    set_usable_ips_title(operatingMode);
    let cidrInput = $('#network').val() + '/' + $('#netsize').val()
    let rootNetwork = get_network($('#network').val(), $('#netsize').val())
    let rootCidr = rootNetwork + '/' + $('#netsize').val()
    if (cidrInput !== rootCidr) {
        show_warning_modal('<div>Your network input is not on a network boundary for this network size. It has been automatically changed:</div><div class="font-monospace pt-2">' + $('#network').val() + ' -> ' + rootNetwork + '</div>')
        $('#network').val(rootNetwork)
        cidrInput = $('#network').val() + '/' + $('#netsize').val()
    }
    if (Object.keys(subnetMap).length > 0) {
        // This page already has data imported, so lets see if we can just change the range
        if (isMatchingSize(Object.keys(subnetMap)[0], cidrInput)) {
            subnetMap = changeBaseNetwork(cidrInput)
            if (typeof window !== 'undefined') { window.subnetMap = subnetMap; }
        } else {
            // This is a page with existing data of a different subnet size, so make it blank
            // Could be an opportunity here to do the following:
            //   - Prompt the user to confirm they want to clear the existing data
            //   - Resize the existing data anyway by making the existing network a subnetwork of their new input (if it
            //     is a larger network), or by just trimming the network to the new size (if it is a smaller network),
            //     or even resizing all of the containing networks by change in size of the base network. For example a
            //     base network going from /16 -> /18 would be all containing networks would be resized smaller (/+2),
            //     or bigger (/-2) if going from /18 -> /16.
            subnetMap = {}
            if (typeof window !== 'undefined') { window.subnetMap = subnetMap; }
            subnetMap[rootCidr] = {}
        }
    } else {
        // This is a fresh page load with no existing data
        subnetMap[rootCidr] = {}
    }
    maxNetSize = parseInt($('#netsize').val())
    renderTable(operatingMode);
    if (!isHydratingFromSnapshot) {
        schedulePlannerSnapshotPersist();
    }
}
function changeBaseNetwork(newBaseNetwork) {
    // Minifiy it, to make all the keys in the subnetMap relative to their original base network
    // Then expand it, but with the new CIDR as the base network, effectively converting from old to new.
    let miniSubnetMap = {}
    minifySubnetMap(miniSubnetMap, subnetMap, Object.keys(subnetMap)[0])
    let newSubnetMap = {}
    expandSubnetMap(newSubnetMap, miniSubnetMap, newBaseNetwork)
    return newSubnetMap
}
function isMatchingSize(subnet1, subnet2) {
    return subnet1.split('/')[1] === subnet2.split('/')[1];
}
$('#calcbody').on('click', 'td.split,td.join', function(event) {
    // HTML DOM Data elements! Yay! See the `data-*` attributes of the HTML tags
    mutate_subnet_map(this.dataset.mutateVerb, this.dataset.subnet, '')
    if (subnetMap && typeof subnetMap === 'object') {
        subnetMap = sortIPCIDRs(subnetMap)
        if (typeof window !== 'undefined') { window.subnetMap = subnetMap; }
    }
    renderTable(operatingMode);
})
$('#calcbody').on('keyup', 'td.note input', function(event) {
    // HTML DOM Data elements! Yay! See the `data-*` attributes of the HTML tags
    let delay = 1000;
    clearTimeout(noteTimeout);
    noteTimeout = setTimeout(function(element) {
        mutate_subnet_map('note', element.dataset.subnet, '', element.value)
    }, delay, this);
})
$('#calcbody').on('focusout', 'td.note input', function(event) {
    // HTML DOM Data elements! Yay! See the `data-*` attributes of the HTML tags
    clearTimeout(noteTimeout);
    mutate_subnet_map('note', this.dataset.subnet, '', this.value)
})
function renderTableFromTree(subnetTree, operatingMode) {
    const tree = subnetTree && typeof subnetTree === 'object' ? subnetTree : {};
    $('#calcbody').empty();
    const maxDepth = get_dict_max_depth(tree, 0);
    addRowTree(tree, 0, maxDepth, operatingMode);
}
let plannerRenderRequestId = 0;
function renderTable(operatingMode, options = {}) {
    const preferDatabase = options.preferDatabase !== false;
    const fallbackTree = options.tree || subnetMap || {};
    renderTableFromTree(fallbackTree, operatingMode);
    if (!preferDatabase) {
        return;
    }
    const manager = typeof window !== 'undefined' ? window.plannerDbManager : null;
    if (!manager || typeof manager.loadPlannerSnapshot !== 'function' || !manager.hasDatabase || !manager.hasDatabase()) {
        return;
    }
    const currentRequest = ++plannerRenderRequestId;
    manager.loadPlannerSnapshot().then((snapshot) => {
        if (currentRequest !== plannerRenderRequestId) {
            return;
        }
        if (!snapshot || !Array.isArray(snapshot.tree)) {
            return;
        }
        const treeMap = snapshotTreeToMap(snapshot.tree);
        subnetMap = treeMap;
        if (typeof window !== 'undefined') {
            window.subnetMap = subnetMap;
        }
        if (snapshot.baseNetwork && typeof snapshot.baseNetwork === 'string' && snapshot.baseNetwork.includes('/')) {
            const split = snapshot.baseNetwork.split('/');
            const networkPart = split[0];
            const maskPart = split[1];
            if (networkPart && maskPart) {
                $('#network').val(networkPart);
                $('#netsize').val(maskPart);
                const parsed = parseInt(maskPart, 10);
                if (!Number.isNaN(parsed)) {
                    maxNetSize = parsed;
                }
            }
        }
        renderTableFromTree(treeMap, operatingMode);
    }).catch((err) => {
        console.warn('Planner DB render failed', err);
    });
}
function addRowTree(subnetTree, depth, maxDepth, operatingMode) {
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            addRowTree(subnetTree[mapKey], depth + 1, maxDepth, operatingMode)
        } else {
            let subnet_split = mapKey.split('/')
            let notesWidth = '30%';
            if ((maxDepth > 5) && (maxDepth <= 10)) {
                notesWidth = '25%';
            } else if ((maxDepth > 10) && (maxDepth <= 15)) {
                notesWidth = '20%';
            } else if ((maxDepth > 15) && (maxDepth <= 20)) {
                notesWidth = '15%';
            } else if (maxDepth > 20) {
                notesWidth = '10%';
            }
            const entryMeta = subnetTree[mapKey] || {};
            const note = typeof entryMeta._note === 'string' ? entryMeta._note : '';
            const colorValue = typeof entryMeta._color === 'string' ? entryMeta._color : '';
            let vlanId = null;
            if (entryMeta._vlan !== undefined && entryMeta._vlan !== null && entryMeta._vlan !== '') {
                const parsedVlan = Number(entryMeta._vlan);
                if (Number.isFinite(parsedVlan)) {
                    vlanId = Math.max(0, Math.trunc(parsedVlan));
                }
            }
            let vrfId = null;
            if (entryMeta._vrf !== undefined && entryMeta._vrf !== null && entryMeta._vrf !== '') {
                const parsedVrf = Number(entryMeta._vrf);
                if (Number.isFinite(parsedVrf)) {
                    vrfId = Math.max(0, Math.trunc(parsedVrf));
                }
            }
            const metadata = {
                name: typeof entryMeta._name === 'string' ? entryMeta._name : '',
                vlanId,
                gatewayIp: typeof entryMeta._gateway === 'string' ? entryMeta._gateway.trim() : '',
                purpose: typeof entryMeta._purpose === 'string' && entryMeta._purpose.length ? entryMeta._purpose.toUpperCase() : 'LAN',
                vrfId,
                isManagement: entryMeta._isManagement === 1 || entryMeta._isManagement === true || entryMeta._isManagement === '1',
                capacityTotal: Number.isFinite(Number(entryMeta._capacityTotal)) ? Number(entryMeta._capacityTotal) : 0,
                capacityUsed: Number.isFinite(Number(entryMeta._capacityUsed)) ? Number(entryMeta._capacityUsed) : 0,
            };
            addRow(subnet_split[0], parseInt(subnet_split[1]), (infoColumnCount + maxDepth - depth), note, notesWidth, colorValue, operatingMode, metadata)
        }
    }
}
function addRow(network, netSize, colspan, note, notesWidth, color, operatingMode, metadata = {}) {
    let addressFirst = ip2int(network);
    let addressLast = subnet_last_address(addressFirst, netSize);
    let usableFirst = subnet_usable_first(addressFirst, netSize, operatingMode);
    let usableLast = subnet_usable_last(addressFirst, netSize);
    let hostCount = 1 + usableLast - usableFirst;
    let styleTag = '';
    if (color !== '') {
        styleTag = ' style="background-color: ' + color + '"';
    }
    let rangeCol, usableCol;
    if (netSize < 32) {
        rangeCol = int2ip(addressFirst) + ' - ' + int2ip(addressLast);
        usableCol = int2ip(usableFirst) + ' - ' + int2ip(usableLast);
    } else {
        rangeCol = int2ip(addressFirst);
        usableCol = int2ip(usableFirst);
    }
    const rowId = 'row_' + network.replace('.', '-') + '_' + netSize;
    const rowCIDR = network + '/' + netSize;
    const safeNote = escapeHtml(note || '');
    const nameValue = typeof metadata.name === 'string' ? metadata.name : '';
    const vlanParsed = Number(metadata.vlanId);
    const vlanValue = Number.isFinite(vlanParsed) ? Math.max(0, Math.trunc(vlanParsed)) : '';
    const gatewayValue = typeof metadata.gatewayIp === 'string' ? metadata.gatewayIp : '';
    const purposeValue = typeof metadata.purpose === 'string' && metadata.purpose.length ? metadata.purpose.toUpperCase() : 'LAN';
    const vrfParsed = Number(metadata.vrfId);
    const vrfValue = Number.isFinite(vrfParsed) ? Math.max(0, Math.trunc(vrfParsed)) : '';
    const isManagement = metadata.isManagement ? true : false;
    const capacityTotalValue = Number(metadata.capacityTotal);
    let capacityTotal = Number.isFinite(capacityTotalValue) ? Math.max(0, Math.trunc(capacityTotalValue)) : 0;
    if (capacityTotal <= 0) {
        capacityTotal = hostCount;
    }
    const capacityUsedValue = Number(metadata.capacityUsed);
    let capacityUsed = Number.isFinite(capacityUsedValue) ? Math.max(0, Math.min(capacityTotal, Math.trunc(capacityUsedValue))) : 0;
    if (capacityUsed > capacityTotal) {
        capacityUsed = capacityTotal;
    }
    const capacityAvailable = Math.max(0, capacityTotal - capacityUsed);
    const purposeChoices = ['LAN', 'MGMT', 'INTERCONNECT', 'OTHER'];
    const purposeOptions = purposeChoices.map((value) => {
        const label = (value === 'LAN' || value === 'MGMT') ? value : value.charAt(0) + value.slice(1).toLowerCase();
        const selected = value === purposeValue ? ' selected' : '';
        return '<option value="' + value + '"' + selected + '>' + label + '</option>';
    }).join('');
    let vrfOptions = '<option value="">--</option>';
    const seenVrfs = new Set();
    if (Array.isArray(plannerVrfs)) {
        vrfOptions += plannerVrfs.map((vrf) => {
            const id = Number(vrf && vrf.id);
            const name = vrf && typeof vrf.name === 'string' ? vrf.name : '';
            if (!Number.isFinite(id)) {
                return '';
            }
            seenVrfs.add(id);
            const selected = id === vrfValue ? ' selected' : '';
            return '<option value="' + id + '"' + selected + '>' + escapeHtml(name) + '</option>';
        }).join('');
    }
    if (vrfValue !== '' && !seenVrfs.has(vrfValue)) {
        vrfOptions += '<option value="' + vrfValue + '" selected>' + escapeHtml(String(vrfValue)) + '</option>';
    }
    const managementChecked = isManagement ? ' checked' : '';
    const nameDisplay = escapeHtml(nameValue);
    const gatewayDisplay = escapeHtml(gatewayValue);
    const vlanDisplay = vlanValue === '' ? '' : vlanValue;
    const capacityLabel = formatNumber(capacityUsed) + ' / ' + formatNumber(capacityTotal);
    const capacityAvailableLabel = formatNumber(capacityAvailable);
    const rowFragments = [
        `            <tr id="${rowId}"${styleTag} aria-label="${rowCIDR}">`,
        `                <td data-subnet="${rowCIDR}" aria-labelledby="${rowId} subnetHeader" class="row_address">${rowCIDR}</td>`,
        `                <td data-subnet="${rowCIDR}" aria-labelledby="${rowId} rangeHeader" class="row_range">${rangeCol}</td>`,
        `                <td data-subnet="${rowCIDR}" aria-labelledby="${rowId} useableHeader" class="row_usable">${usableCol}</td>`,
        `                <td data-subnet="${rowCIDR}" aria-labelledby="${rowId} hostsHeader" class="row_hosts">${hostCount}</td>`,
        `                <td class="note" style="width:${notesWidth}">`,
        `                    <label><input aria-label="${rowCIDR} Note" type="text" class="form-control shadow-none p-0" data-subnet="${rowCIDR}" value="${safeNote}"></label>`,
        `                    <div class="subnet-metadata mt-2" data-subnet="${rowCIDR}">`,
        `                        <div class="row g-1 align-items-center">`,
        `                            <div class="col-12 col-sm-6">`,
        `                                <input type="text" class="form-control form-control-sm shadow-none subnet-name-input" data-subnet="${rowCIDR}" aria-label="Name for ${rowCIDR}" placeholder="Name" value="${nameDisplay}">`,
        `                            </div>`,
        `                            <div class="col-6 col-sm-3">`,
        `                                <input type="number" class="form-control form-control-sm shadow-none subnet-vlan-input" data-subnet="${rowCIDR}" aria-label="VLAN for ${rowCIDR}" placeholder="VLAN" min="0" max="4094" value="${vlanDisplay}">`,
        `                            </div>`,
        `                            <div class="col-6 col-sm-3">`,
        `                                <select class="form-select form-select-sm subnet-purpose-select" data-subnet="${rowCIDR}" aria-label="Purpose for ${rowCIDR}">${purposeOptions}</select>`,
        `                            </div>`,
        `                            <div class="col-12 col-sm-6">`,
        `                                <select class="form-select form-select-sm subnet-vrf-select" data-subnet="${rowCIDR}" aria-label="VRF for ${rowCIDR}">${vrfOptions}</select>`,
        `                            </div>`,
        `                            <div class="col-8 col-sm-4">`,
        `                                <input type="text" class="form-control form-control-sm shadow-none subnet-gateway-input" data-subnet="${rowCIDR}" aria-label="Gateway IP for ${rowCIDR}" placeholder="Gateway" value="${gatewayDisplay}">`,
        `                            </div>`,
        `                            <div class="col-4 col-sm-2 d-flex align-items-center">`,
        `                                <div class="form-check form-switch form-switch-sm">`,
        `                                    <input class="form-check-input subnet-management-checkbox" type="checkbox" role="switch" data-subnet="${rowCIDR}" aria-label="Mark ${rowCIDR} as management"${managementChecked}>`,
        `                                    <label class="form-check-label">Mgmt</label>`,
        `                                </div>`,
        `                            </div>`,
        `                            <div class="col-12">`,
        `                                <div class="form-text">Capacity: ${capacityLabel} (available ${capacityAvailableLabel})</div>`,
        `                            </div>`,
        `                        </div>`,
        `                    </div>`,
        `                </td>`,
        `                <td data-subnet="${rowCIDR}" aria-labelledby="${rowId} splitHeader" rowspan="1" colspan="${colspan}" class="split rotate" data-mutate-verb="split"><span>/${netSize}</span></td>`
    ];
    if (netSize > maxNetSize) {
        const matchingNetworkList = get_matching_network_list(network, subnetMap).slice(1);
        for (const matchingNetwork of matchingNetworkList) {
            const networkChildrenCount = count_network_children(matchingNetwork, subnetMap, []);
        rowFragments.push(`                <td aria-label="${matchingNetwork} Join" rowspan="${networkChildrenCount}" colspan="1" class="join rotate" data-subnet="${matchingNetwork}" data-mutate-verb="join"><span>/${matchingNetwork.split('/')[1]}</span></td>`);
        }
    }
    rowFragments.push('            </tr>');
    $('#calcbody').append(rowFragments.join('\n'));

}
function ip2int(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}
function int2ip (ipInt) {
    return ((ipInt>>>24) + '.' + (ipInt>>16 & 255) + '.' + (ipInt>>8 & 255) + '.' + (ipInt & 255));
}
function escapeHtml(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.replace(/[&<"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char] || char));
}
function formatNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return '0';
    }
    return numeric.toLocaleString();
}
function toBase36(num) {
    return num.toString(36);
}
function fromBase36(str) {
    return parseInt(str, 36);
}
/**
 * Coordinate System for Subnet Representation
 *
 * This system aims to represent subnets efficiently within a larger network space.
 * The goal is to produce the shortest possible string representation for subnets,
 * which is particularly effective when dealing with hierarchical network designs.
 *
 * Key concept:
 * - We represent a subnet by its ordinal position within a larger network,
 *   along with its mask size.
 * - This approach is most efficient when subnets are relatively close together
 *   in the address space and of similar sizes.
 *
 * Benefits:
 * 1. Compact representation: Often results in very short strings (e.g., "7k").
 * 2. Hierarchical: Naturally represents subnet hierarchy.
 * 3. Efficient for common cases: Works best for typical network designs where
 *    subnets are grouped and of similar sizes.
 *
 * Trade-offs:
 * - Less efficient for representing widely dispersed or highly varied subnet sizes.
 * - Requires knowledge of the base network to interpret.
 *
 * Extreme Example... Representing the value 192.168.200.210/31 within the base
 * network of 192.168.200.192/27. These are arbitrary but long subnets to represent
 * as a string.
 * - Normal Way - '192.168.200.210/31'
 * - Nth Position Way - '9v'
 *   - '9' represents the 9th /31 subnet within the /27
 *   - 'v' represents the /31 mask size converted to Base 36 (31 -> 'v')
 */
/**
 * Converts a specific subnet to its Nth position representation within a base network.
 *
 * @param {string} baseNetwork - The larger network containing the subnet (e.g., "10.0.0.0/16")
 * @param {string} specificSubnet - The subnet to be represented (e.g., "10.0.112.0/20")
 * @returns {string} A compact string representing the subnet's position and size (e.g., "7k")
 */
function getNthSubnet(baseNetwork, specificSubnet) {
    const [baseIp, baseMask] = baseNetwork.split('/');
    const [specificIp, specificMask] = specificSubnet.split('/');
    const baseInt = ip2int(baseIp);
    const specificInt = ip2int(specificIp);
    const baseSize = 32 - parseInt(baseMask, 10);
    const specificSize = 32 - parseInt(specificMask, 10);
    const offset = specificInt - baseInt;
    const nthSubnet = offset >>> specificSize;
    return `${nthSubnet}${toBase36(parseInt(specificMask, 10))}`;
}
/**
 * Reconstructs a subnet from its Nth position representation within a base network.
 *
 * @param {string} baseNetwork - The larger network containing the subnet (e.g., "10.0.0.0/16")
 * @param {string} nthString - The compact representation of the subnet (e.g., "7k")
 * @returns {string} The full subnet representation (e.g., "10.0.112.0/20")
 */
// Takes 10.0.0.0/16 and '7k' and returns 10.0.96.0/20
// '10.0.96.0/20' being the 7th /20 (base36 'k' is 20 int) within the /16.
function getSubnetFromNth(baseNetwork, nthString) {
    const [baseIp, baseMask] = baseNetwork.split('/');
    const baseInt = ip2int(baseIp);
    const size = fromBase36(nthString.slice(-1));
    const nth = parseInt(nthString.slice(0, -1), 10);
    const innerSizeInt = 32 - size;
    const subnetInt = baseInt + (nth << innerSizeInt);
    return `${int2ip(subnetInt)}/${size}`;
}
function subnet_last_address(subnet, netSize) {
    return subnet + subnet_addresses(netSize) - 1;
}
function subnet_addresses(netSize) {
    return 2**(32-netSize);
}
function subnet_usable_first(network, netSize, operatingMode) {
    if (netSize < 31) {
        // https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html
        // AWS reserves 3 additional IPs
        // https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#are-there-any-restrictions-on-using-ip-addresses-within-these-subnets
        // Azure reserves 3 additional IPs
        // https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet
        // OCI reserves 2 additional IPs
        //return network + (operatingMode == 'Standard' ? 1 : 4);
        switch (operatingMode) {
            case 'AWS':
            case 'AZURE':
                return network + 4;
                break;
            case 'OCI':
                return network + 2;
                break;
            default:
                return network + 1;
                break;
        }            
    } else {
        return network;
    }
}
function subnet_usable_last(network, netSize) {
    let last_address = subnet_last_address(network, netSize);
    if (netSize < 31) {
        return last_address - 1;
    } else {
        return last_address;
    }
}
function get_dict_max_depth(dict, curDepth) {
    let maxDepth = curDepth
    for (let mapKey in dict) {
        if (mapKey.startsWith('_')) { continue; }
        let newDepth = get_dict_max_depth(dict[mapKey], curDepth + 1)
        if (newDepth > maxDepth) { maxDepth = newDepth }
    }
    return maxDepth
}
function get_join_children(subnetTree, childCount) {
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            childCount += get_join_children(subnetTree[mapKey])
        } else {
            return childCount
        }
    }
}
function has_network_sub_keys(dict) {
    if (!dict || typeof dict !== 'object') { return false }
    let allKeys = Object.keys(dict)
    // Maybe an efficient way to do this with a Lambda?
    for (let i in allKeys) {
        if (!allKeys[i].startsWith('_') && !['n', 'c', 'na', 'v', 'g', 'p', 'r', 'm', 't', 'u'].includes(allKeys[i])) {
            return true
        }
    }
    return false
}
function count_network_children(network, subnetTree, ancestryList) {
    // TODO: This might be able to be optimized. Ultimately it needs to count the number of keys underneath
    // the current key are unsplit networks (IE rows in the table, IE keys with a value of {}).
    let childCount = 0
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            childCount += count_network_children(network, subnetTree[mapKey], ancestryList.concat([mapKey]))
        } else {
            if (ancestryList.includes(network)) {
                childCount += 1
            }
        }
    }
    return childCount
}
function get_network_children(network, subnetTree) {
    // TODO: This might be able to be optimized. Ultimately it needs to count the number of keys underneath
    // the current key are unsplit networks (IE rows in the table, IE keys with a value of {}).
    let subnetList = []
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            subnetList.push.apply(subnetList, get_network_children(network, subnetTree[mapKey]))
        } else {
            subnetList.push(mapKey)
        }
    }
    return subnetList
}
function get_matching_network_list(network, subnetTree) {
    let subnetList = []
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            subnetList.push.apply(subnetList, get_matching_network_list(network, subnetTree[mapKey]))
        }
        if (mapKey.split('/')[0] === network) {
            subnetList.push(mapKey)
        }
    }
    return subnetList
}
function get_consolidated_property(subnetTree, property) {
    let allValues = get_property_values(subnetTree, property)
    // https://stackoverflow.com/questions/14832603/check-if-all-values-of-array-are-equal
    let allValuesMatch = allValues.every( (val, i, arr) => val === arr[0] )
    if (allValuesMatch) {
        return allValues[0]
    } else {
        return ''
    }
}
function get_property_values(subnetTree, property) {
    if (!subnetTree || typeof subnetTree !== 'object') { return [] }
    let propValues = []
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            propValues.push.apply(propValues, get_property_values(subnetTree[mapKey], property))
        } else {
            // The "else" above is a bit different because it will start tracking values for subnets which are
            // in the hierarchy, but not displayed. Those are always blank so it messes up the value list
            const entry = subnetTree[mapKey] && typeof subnetTree[mapKey] === 'object' ? subnetTree[mapKey] : {}
            propValues.push(entry[property] || '')
        }
    }
    return propValues
}
function get_network(networkInput, netSize) {
    let ipInt = ip2int(networkInput)
    netSize = parseInt(netSize)
    for (let i=31-netSize; i>=0; i--) {
        ipInt &= ~ 1<<i;
    }
    return int2ip(ipInt);
}
function split_network(networkInput, netSize) {
    let subnets = [networkInput + '/' + (netSize + 1)]
    let newSubnet = ip2int(networkInput) + 2**(32-netSize-1);
    subnets.push(int2ip(newSubnet) + '/' + (netSize + 1))
    return subnets;
}
function mutate_subnet_map(verb, network, subnetTree, propValue = '', isNested = false) {
    if (subnetTree === '') { subnetTree = subnetMap }
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            mutate_subnet_map(verb, network, subnetTree[mapKey], propValue, true)
        }
        if (mapKey === network) {
            let netSplit = mapKey.split('/')
            let netSize = parseInt(netSplit[1])
            if (verb === 'split') {
                if (netSize < minSubnetSizes[operatingMode]) {
                    let new_networks = split_network(netSplit[0], netSize)
                    // Could maybe optimize this for readability with some null coalescing
                    subnetTree[mapKey][new_networks[0]] = {}
                    subnetTree[mapKey][new_networks[1]] = {}
                    const inheritedPurpose = typeof subnetTree[mapKey]._purpose === 'string' && subnetTree[mapKey]._purpose.length ? subnetTree[mapKey]._purpose : 'LAN';
                    subnetTree[mapKey][new_networks[0]]._purpose = inheritedPurpose;
                    subnetTree[mapKey][new_networks[1]]._purpose = inheritedPurpose;
                    if (subnetTree[mapKey]._vrf !== undefined && subnetTree[mapKey]._vrf !== null && subnetTree[mapKey]._vrf !== '') {
                        subnetTree[mapKey][new_networks[0]]._vrf = subnetTree[mapKey]._vrf;
                        subnetTree[mapKey][new_networks[1]]._vrf = subnetTree[mapKey]._vrf;
                    }
                    const inheritedManagement = subnetTree[mapKey]._isManagement === 1 || subnetTree[mapKey]._isManagement === true || subnetTree[mapKey]._isManagement === '1';
                    subnetTree[mapKey][new_networks[0]]._isManagement = inheritedManagement ? 1 : 0;
                    subnetTree[mapKey][new_networks[1]]._isManagement = inheritedManagement ? 1 : 0;
                    if (subnetTree[mapKey].hasOwnProperty('_vlan')) {
                        delete subnetTree[mapKey]._vlan;
                    }
                    if (subnetTree[mapKey].hasOwnProperty('_gateway')) {
                        delete subnetTree[mapKey]._gateway;
                    }
                    // Options:
                    //   [ Selected ] Copy note to both children and delete parent note
                    //   [ Possible ] Blank out the new and old subnet notes
                    if (subnetTree[mapKey].hasOwnProperty('_note')) {
                        subnetTree[mapKey][new_networks[0]]['_note'] = subnetTree[mapKey]['_note']
                        subnetTree[mapKey][new_networks[1]]['_note'] = subnetTree[mapKey]['_note']
                    }
                    delete subnetTree[mapKey]['_note']
                    if (subnetTree[mapKey].hasOwnProperty('_color')) {
                        subnetTree[mapKey][new_networks[0]]['_color'] = subnetTree[mapKey]['_color']
                        subnetTree[mapKey][new_networks[1]]['_color'] = subnetTree[mapKey]['_color']
                    }
                    delete subnetTree[mapKey]['_color']
                } else {
                    switch (operatingMode) {
                        case 'AWS':
                            var modal_error_message = 'The minimum IPv4 subnet size for AWS is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html#subnet-sizing-ipv4" target="_blank" rel="noopener noreferrer">Amazon Virtual Private Cloud > User Guide > Subnet CIDR Blocks > Subnet Sizing for IPv4</a>'
                            break;
                        case 'AZURE':
                            var modal_error_message = 'The minimum IPv4 subnet size for Azure is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#how-small-and-how-large-can-virtual-networks-and-subnets-be" target="_blank" rel="noopener noreferrer">Azure Virtual Network FAQ > How small and how large can virtual networks and subnets be?</a>'
                            break;
                        case 'OCI':
                            var modal_error_message = 'The minimum IPv4 subnet size for OCI is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet" target="_blank" rel="noopener noreferrer">Infrastructure Services>Networking>Networking Overview>Three IP Addresses in Each Subnet</a>'
                            break;
                        default:
                            var modal_error_message = 'The minimum size for an IPv4 subnet is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://en.wikipedia.org/wiki/Classless_Inter-Domain_Routing" target="_blank" rel="noopener noreferrer">Wikipedia - Classless Inter-Domain Routing</a>'
                            break;
                    }
                    show_warning_modal('<div>' + modal_error_message + '</div>')
                }
            } else if (verb === 'join') {
                // Options:
                //   [ Selected ] Keep note if all the notes are the same, blank them out if they differ. Most intuitive
                //   [ Possible ] Lose note data for all deleted subnets.
                //   [ Possible ] Keep note from first subnet in the join scope. Reasonable but I think rarely will the note be kept by the user
                //   [ Possible ] Concatenate all notes. Ugly and won't really be useful for more than two subnets being joined
                subnetTree[mapKey] = {
                    '_note': get_consolidated_property(subnetTree[mapKey], '_note'),
                    '_color': get_consolidated_property(subnetTree[mapKey], '_color')
                }
            } else if (verb === 'note') {
                subnetTree[mapKey]['_note'] = propValue
            } else if (verb === 'color') {
                subnetTree[mapKey]['_color'] = propValue
            } else {
                // How did you get here?
            }
        }
    }
    if (!isNested && !isHydratingFromSnapshot) {
        schedulePlannerSnapshotPersist();
    }
}
function switchMode(operatingMode) {
    let isSwitched = true;
    if (subnetMap !== null) {
        if (validateSubnetSizes(subnetMap, minSubnetSizes[operatingMode])) {
            renderTable(operatingMode);
            set_usable_ips_title(operatingMode);
            $('#netsize').attr('pattern', netsizePatterns[operatingMode]);
            $('#input_form').removeClass('was-validated');
            $('#input_form').rules('remove', 'netsize');
            switch (operatingMode) {
                case 'AWS':
                    var validate_error_message = 'AWS Mode - Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
                case 'AZURE':
                    var validate_error_message = 'Azure Mode - Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
                case 'OCI':
                    var validate_error_message = 'OCI Mode - Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
                default:
                    var validate_error_message = 'Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
            }
            // Modify jquery validation rule
            $('#input_form #netsize').rules('add', {
                required: true,
                pattern: netsizePatterns[operatingMode],
                messages: {
                    required: 'Please enter a network size',
                    pattern: validate_error_message
                }
            });
            // Remove active class from all buttons if needed
            $('#dropdown_standard, #dropdown_azure, #dropdown_aws, #dropdown_oci').removeClass('active');
            $('#dropdown_' + operatingMode.toLowerCase()).addClass('active');
            isSwitched = true;
        } else {
            switch (operatingMode) {
                case 'AWS':
                    var modal_error_message = 'One or more subnets are smaller than the minimum allowed for AWS.<br/>The smallest size allowed is /' + minSubnetSizes[operatingMode] + '.<br/>See: <a href="https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html#subnet-sizing-ipv4" target="_blank" rel="noopener noreferrer">Amazon Virtual Private Cloud > User Guide > Subnet CIDR Blocks > Subnet Sizing for IPv4</a>'
                    break;
                case 'AZURE':
                    var modal_error_message = 'One or more subnets are smaller than the minimum allowed for Azure.<br/>The smallest size allowed is /' + minSubnetSizes[operatingMode] + '.<br/>See: <a href="https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#how-small-and-how-large-can-virtual-networks-and-subnets-be" target="_blank" rel="noopener noreferrer">Azure Virtual Network FAQ > How small and how large can virtual networks and subnets be?</a>'
                    break;
                case 'OCI':
                    var modal_error_message = 'One or more subnets are smaller than the minimum allowed for OCI.<br/>The smallest size allowed is /' + minSubnetSizes[operatingMode] + '.<br/>See: <a href="https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet" target="_blank" rel="noopener noreferrer">Infrastructure Services>Networking>Networking Overview>Three IP Addresses in Each Subnet</a>'
                    break;
                default:
                    var validate_error_message = 'Unknown Error'
                    break;
            }
            show_warning_modal('<div>' + modal_error_message + '</div>');
            isSwitched = false;
        }
    } else {
        //unlikely to get here.
        reset();
    }
    if (isSwitched && !isHydratingFromSnapshot) {
        schedulePlannerSnapshotPersist();
    }
    return isSwitched;
}
function validateSubnetSizes(subnetMap, minSubnetSize) {
    let isValid = true;
    const validate = (subnetTree) => {
        for (let key in subnetTree) {
            if (key.startsWith('_')) continue; // Skip special keys
            let [_, size] = key.split('/');
            if (parseInt(size) > minSubnetSize) {
                isValid = false;
                return; // Early exit if any subnet is invalid
            }
            if (typeof subnetTree[key] === 'object') {
                validate(subnetTree[key]); // Recursively validate subnets
            }
        }
    };
    validate(subnetMap);
    return isValid;
}
function set_usable_ips_title(operatingMode) {
    switch (operatingMode) {
        case 'AWS':
            $('#useableHeader').html('Usable IPs (<a href="https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html#subnet-sizing-ipv4" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-html="true" title="AWS reserves 5 addresses in each subnet for platform use.<br/>Click to navigate to the AWS documentation.">AWS</a>)')
            break;
        case 'AZURE':
            $('#useableHeader').html('Usable IPs (<a href="https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#are-there-any-restrictions-on-using-ip-addresses-within-these-subnets" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-html="true" title="Azure reserves 5 addresses in each subnet for platform use.<br/>Click to navigate to the Azure documentation.">Azure</a>)')
            break;
        case 'OCI':
            $('#useableHeader').html('Usable IPs (<a href="https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-html="true" title="OCI reserves 3 addresses in each subnet for platform use.<br/>Click to navigate to the OCI documentation.">OCI</a>)')
            break;
        default:
            $('#useableHeader').html('Usable IPs')
            break;
    }
    $('[data-bs-toggle="tooltip"]').tooltip()
}
function show_warning_modal(message) {
    var notifyModal = new bootstrap.Modal(document.getElementById('notifyModal'), {});
    $('#notifyModal .modal-body').html(message)
    notifyModal.show()
}
$( document ).ready(function() {
    // Initialize the jQuery Validation on the form
    var validator = $('#input_form').validate({
        onfocusout: function (element) {
            $(element).valid();
        },
        rules: {
            network: {
                required: true,
                pattern: '^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$'
            },
            netsize: {
                required: true,
                pattern: '^([0-9]|[12][0-9]|3[0-2])$'
            }
        },
        messages: {
            network: {
                required: 'Please enter a network',
                pattern: 'Must be a valid IPv4 Address'
            },
            netsize: {
                required: 'Please enter a network size',
                pattern: 'Smallest size is /32'
            }
        },
        errorPlacement: function(error, element) {
            //console.log(error);
            //console.log(element);
            if (error[0].innerHTML !== '') {
                //console.log('Error Placement - Text')
                if (!element.data('errorIsVisible')) {
                    bootstrap.Tooltip.getInstance(element).setContent({'.tooltip-inner': error[0].innerHTML})
                    element.tooltip('show');
                    element.data('errorIsVisible', true)
                }
            } else {
                //console.log('Error Placement - Empty')
                //console.log(element);
                if (element.data('errorIsVisible')) {
                    element.tooltip('hide');
                    element.data('errorIsVisible', false)
                }
            }
            //console.log(element);
        },
        // This success function appears to be required as errorPlacement() does not fire without the success function
        // being defined.
        success: function(label, element) { },
        // When the form is valid, add the 'was-validated' class
        submitHandler: function(form) {
            form.classList.add('was-validated');
            form.submit(); // Submit the form
        }
    });
    let autoConfigResult = processConfigUrl();
    if (!autoConfigResult) {
        reset();
    }
});
function exportConfig(isMinified = true) {
    const baseNetwork = Object.keys(subnetMap)[0]
    let miniSubnetMap = {};
    subnetMap = sortIPCIDRs(subnetMap)
    if (typeof window !== 'undefined') { window.subnetMap = subnetMap; }
    if (isMinified) {
        minifySubnetMap(miniSubnetMap, subnetMap, baseNetwork)
    }
    if (operatingMode !== 'Standard') {
        return {
            'config_version': configVersion,
            'operating_mode': operatingMode,
            'base_network': baseNetwork,
            'subnets': isMinified ? miniSubnetMap : subnetMap,
        }
    } else {
        return {
            'config_version': configVersion,
            'base_network': baseNetwork,
            'subnets': isMinified ? miniSubnetMap : subnetMap,
        }
    }
}
function getConfigUrl() {
    // Deep Copy
    let defaultExport = JSON.parse(JSON.stringify(exportConfig(true)));
    renameKey(defaultExport, 'config_version', 'v')
    renameKey(defaultExport, 'base_network', 'b')
    if (defaultExport.hasOwnProperty('operating_mode')) {
        renameKey(defaultExport, 'operating_mode', 'm')
    }
    renameKey(defaultExport, 'subnets', 's')
    //console.log(JSON.stringify(defaultExport))
    return '/index.html?c=' + urlVersion + LZString.compressToEncodedURIComponent(JSON.stringify(defaultExport))
}
function processConfigUrl() {
    const params = new Proxy(new URLSearchParams(window.location.search), {
        get: (searchParams, prop) => searchParams.get(prop),
    });
    if (params['c'] !== null) {
        // First character is the version of the URL string, in case the mechanism of encoding changes
        let urlVersion = params['c'].substring(0, 1)
        let urlData = params['c'].substring(1)
        let urlConfig = JSON.parse(LZString.decompressFromEncodedURIComponent(params['c'].substring(1)))
        renameKey(urlConfig, 'v', 'config_version')
        if (urlConfig.hasOwnProperty('m')) {
            renameKey(urlConfig, 'm', 'operating_mode')
        }
        renameKey(urlConfig, 's', 'subnets')
        if (urlConfig['config_version'] === '1') {
            // Version 1 Configs used full subnet strings as keys and just shortned the _note->_n and _color->_c keys
            expandKeys(urlConfig['subnets'])
        } else if (urlConfig['config_version'] === '2') {
            // Version 2 Configs uses the Nth Position representation for subnet keys and requires the base_network
            // option. It also uses n/c for note/color
            if (urlConfig.hasOwnProperty('b')) {
                renameKey(urlConfig, 'b', 'base_network')
            }
            let expandedSubnetMap = {};
            expandSubnetMap(expandedSubnetMap, urlConfig['subnets'], urlConfig['base_network'])
            urlConfig['subnets'] = expandedSubnetMap
        }
        importConfig(urlConfig)
        return true
    }
}
function minifySubnetMap(minifiedMap, referenceMap, baseNetwork) {
    for (let subnet in referenceMap) {
        if (subnet.startsWith('_')) continue;
        const nthRepresentation = getNthSubnet(baseNetwork, subnet);
        const entry = referenceMap[subnet] || {};
        minifiedMap[nthRepresentation] = {};
        if (entry.hasOwnProperty('_note')) {
            minifiedMap[nthRepresentation].n = entry._note;
        }
        if (entry.hasOwnProperty('_color')) {
            minifiedMap[nthRepresentation].c = entry._color;
        }
        if (entry.hasOwnProperty('_name') && entry._name) {
            minifiedMap[nthRepresentation].na = entry._name;
        }
        if (entry.hasOwnProperty('_vlan') && entry._vlan !== null && entry._vlan !== undefined && entry._vlan !== '') {
            minifiedMap[nthRepresentation].v = entry._vlan;
        }
        if (entry.hasOwnProperty('_gateway') && entry._gateway) {
            minifiedMap[nthRepresentation].g = entry._gateway;
        }
        if (entry.hasOwnProperty('_purpose')) {
            minifiedMap[nthRepresentation].p = entry._purpose;
        }
        if (entry.hasOwnProperty('_vrf') && entry._vrf !== null && entry._vrf !== undefined && entry._vrf !== '') {
            minifiedMap[nthRepresentation].r = entry._vrf;
        }
        if (entry.hasOwnProperty('_isManagement')) {
            minifiedMap[nthRepresentation].m = entry._isManagement;
        }
        if (entry.hasOwnProperty('_capacityTotal')) {
            minifiedMap[nthRepresentation].t = entry._capacityTotal;
        }
        if (entry.hasOwnProperty('_capacityUsed')) {
            minifiedMap[nthRepresentation].u = entry._capacityUsed;
        }
        if (Object.keys(entry).some((key) => !key.startsWith('_'))) {
            minifySubnetMap(minifiedMap[nthRepresentation], entry, baseNetwork);
        }
    }
}
function expandSubnetMap(expandedMap, miniMap, baseNetwork) {
    for (let mapKey in miniMap) {
        if (['n', 'c', 'na', 'v', 'g', 'p', 'r', 'm', 't', 'u'].includes(mapKey)) {
            continue;
        }
        let subnetKey = getSubnetFromNth(baseNetwork, mapKey);
        expandedMap[subnetKey] = expandedMap[subnetKey] || {};
        const miniEntry = miniMap[mapKey] || {};
        if (has_network_sub_keys(miniEntry)) {
            expandSubnetMap(expandedMap[subnetKey], miniEntry, baseNetwork);
        }
        if (miniEntry.hasOwnProperty('n')) {
            expandedMap[subnetKey]._note = miniEntry.n;
        }
        if (miniEntry.hasOwnProperty('c')) {
            expandedMap[subnetKey]._color = miniEntry.c;
        }
        if (miniEntry.hasOwnProperty('na')) {
            expandedMap[subnetKey]._name = miniEntry.na;
        }
        if (miniEntry.hasOwnProperty('v')) {
            expandedMap[subnetKey]._vlan = miniEntry.v;
        }
        if (miniEntry.hasOwnProperty('g')) {
            expandedMap[subnetKey]._gateway = miniEntry.g;
        }
        if (miniEntry.hasOwnProperty('p')) {
            expandedMap[subnetKey]._purpose = miniEntry.p;
        } else if (!expandedMap[subnetKey].hasOwnProperty('_purpose')) {
            expandedMap[subnetKey]._purpose = 'LAN';
        }
        if (miniEntry.hasOwnProperty('r')) {
            expandedMap[subnetKey]._vrf = miniEntry.r;
        }
        if (miniEntry.hasOwnProperty('m')) {
            expandedMap[subnetKey]._isManagement = miniEntry.m;
        } else if (!expandedMap[subnetKey].hasOwnProperty('_isManagement')) {
            expandedMap[subnetKey]._isManagement = 0;
        }
        if (miniEntry.hasOwnProperty('t')) {
            expandedMap[subnetKey]._capacityTotal = miniEntry.t;
        }
        if (miniEntry.hasOwnProperty('u')) {
            expandedMap[subnetKey]._capacityUsed = miniEntry.u;
        }
        if (!expandedMap[subnetKey].hasOwnProperty('_purpose')) {
            expandedMap[subnetKey]._purpose = 'LAN';
        }
    }
}
function findSubnetEntry(tree, targetCidr) {
    if (!tree || typeof tree !== 'object') {
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(tree, targetCidr)) {
        return tree[targetCidr];
    }
    for (const key of Object.keys(tree)) {
        if (key.startsWith('_')) {
            continue;
        }
        const child = findSubnetEntry(tree[key], targetCidr);
        if (child) {
            return child;
        }
    }
    return null;
}
function getSubnetEntry(cidr) {
    return findSubnetEntry(subnetMap, cidr);
}
function updateSubnetEntry(cidr, updater) {
    if (typeof cidr !== 'string' || typeof updater !== 'function') {
        return false;
    }
    const entry = getSubnetEntry(cidr);
    if (!entry) {
        return false;
    }
    updater(entry);
    schedulePlannerSnapshotPersist();
    return true;
}
function isVlanAvailableForCidr(vlanId, targetCidr) {
    if (vlanId === null || vlanId === undefined) {
        return true;
    }
    let available = true;
    const check = (tree) => {
        if (!tree || typeof tree !== 'object' || !available) {
            return;
        }
        for (const key of Object.keys(tree)) {
            if (available === false) {
                break;
            }
            if (key.startsWith('_')) {
                continue;
            }
            if (key !== targetCidr) {
                const entry = tree[key] || {};
                if (entry.hasOwnProperty('_vlan')) {
                    const parsed = Number(entry._vlan);
                    if (Number.isFinite(parsed) && parsed === vlanId) {
                        available = false;
                        break;
                    }
                }
            }
            check(tree[key]);
        }
    };
    check(subnetMap);
    return available;
}
function isValidIpv4(value) {
    if (typeof value !== 'string') {
        return false;
    }
    const parts = value.trim().split('.');
    if (parts.length !== 4) {
        return false;
    }
    return parts.every((part) => {
        if (part === '' || /[^0-9]/.test(part)) {
            return false;
        }
        const parsed = Number(part);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 255) {
            return false;
        }
        return String(parsed) === String(Number(part));
    });
}
function isGatewayValidForSubnet(cidr, gateway, mode) {
    if (!gateway) {
        return true;
    }
    if (!isValidIpv4(gateway) || typeof cidr !== 'string' || !cidr.includes('/')) {
        return false;
    }
    const [networkPart, maskPart] = cidr.split('/');
    const netSize = Number(maskPart);
    if (!Number.isFinite(netSize) || netSize < 0 || netSize > 32) {
        return false;
    }
    const networkInt = ip2int(networkPart);
    const ipInt = ip2int(gateway.trim());
    if (!Number.isFinite(networkInt) || !Number.isFinite(ipInt)) {
        return false;
    }
    const networkEnd = subnet_last_address(networkInt, netSize);
    if (ipInt < networkInt || ipInt > networkEnd) {
        return false;
    }
    const normalizedMode = typeof mode === 'string' && mode.length ? mode : operatingMode;
    const usableFirst = subnet_usable_first(networkInt, netSize, normalizedMode);
    const usableLast = subnet_usable_last(networkInt, netSize);
    return ipInt >= usableFirst && ipInt <= usableLast;
}
function refreshPlannerVrfs(manager) {
    let nextVrfs = [{ id: 1, name: 'GLOBAL' }, { id: 2, name: 'MGMT' }];
    const resolvedManager = manager || (typeof window !== 'undefined' ? window.plannerDbManager : null);
    if (resolvedManager && typeof resolvedManager.listVrfs === 'function') {
        try {
            const rows = resolvedManager.listVrfs();
            if (Array.isArray(rows) && rows.length > 0) {
                const normalized = rows.map((row) => ({
                    id: Number(row && row.id),
                    name: row && typeof row.name === 'string' ? row.name : '',
                })).filter((item) => Number.isFinite(item.id) && item.name.length > 0);
                if (normalized.length > 0) {
                    const unique = new Map();
                    normalized.forEach((item) => {
                        if (!unique.has(item.id)) {
                            unique.set(item.id, item);
                        }
                    });
                    nextVrfs = Array.from(unique.values());
                }
            }
        } catch (err) {
            console.warn('Planner VRF list fetch failed', err);
        }
    }
    plannerVrfs = nextVrfs;
    if (typeof window !== 'undefined') {
    }
}
// For Config Version 1 Backwards Compatibility
function expandKeys(subnetTree) {
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) {
            continue;
        }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            expandKeys(subnetTree[mapKey])
        } else {
            if (subnetTree[mapKey].hasOwnProperty('_n')) {
                renameKey(subnetTree[mapKey], '_n', '_note')
            }
            if (subnetTree[mapKey].hasOwnProperty('_c')) {
                renameKey(subnetTree[mapKey], '_c', '_color')
            }
        }
    }
}
function renameKey(obj, oldKey, newKey) {
    if (oldKey !== newKey) {
    Object.defineProperty(obj, newKey,
        Object.getOwnPropertyDescriptor(obj, oldKey));
        delete obj[oldKey];
    }
}
function importConfig(text) {
    if (text['config_version'] === '1') {
        var [subnetNet, subnetSize] = Object.keys(text['subnets'])[0].split('/')
    } else if (text['config_version'] === '2') {
        var [subnetNet, subnetSize] = text['base_network'].split('/')
    }
    $('#network').val(subnetNet)
    $('#netsize').val(subnetSize)
    maxNetSize = subnetSize
    subnetMap = sortIPCIDRs(text['subnets']);
    if (typeof window !== 'undefined') { window.subnetMap = subnetMap; }
    operatingMode = text['operating_mode'] || 'Standard'
    switchMode(operatingMode);
}
function compareCidrs(a, b) {
    if (!a || !b) {
        return 0;
    }
    const parts = a.split('/');
    const otherParts = b.split('/');
    const maskA = parts.length > 1 ? parts[1] : '0';
    const maskB = otherParts.length > 1 ? otherParts[1] : '0';
    const ipCompare = compareIpStrings(parts[0], otherParts[0]);
    if (ipCompare !== 0) {
        return ipCompare;
    }
    return parseInt(maskA, 10) - parseInt(maskB, 10);
}
function compareIpStrings(ipA, ipB) {
    const partsA = (ipA || '').split('.').map((part) => parseInt(part, 10) || 0);
    const partsB = (ipB || '').split('.').map((part) => parseInt(part, 10) || 0);
    for (let i = 0; i < 4; i++) {
        const diff = partsA[i] - partsB[i];
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}
function mapToSnapshotNodes(map, mode) {
    if (!map || typeof map !== 'object') {
        return [];
    }
    const keys = Object.keys(map)
        .filter((key) => !key.startsWith('_'))
        .sort(compareCidrs);
    const effectiveMode = typeof mode === 'string' && mode.length ? mode : operatingMode;
    return keys.map((key, index) => {
        const entry = map[key] || {};
        const children = mapToSnapshotNodes(entry, effectiveMode);
        const name = typeof entry._name === 'string' ? entry._name.trim() : '';
        let vlanId = null;
        if (entry._vlan !== undefined && entry._vlan !== null && entry._vlan !== '') {
            const parsedVlan = Number(entry._vlan);
            if (Number.isFinite(parsedVlan)) {
                vlanId = Math.max(0, Math.trunc(parsedVlan));
            }
        }
        const gatewayIp = typeof entry._gateway === 'string' ? entry._gateway.trim() : '';
        const purposeValue = typeof entry._purpose === 'string' && entry._purpose.length ? entry._purpose : 'LAN';
        const purpose = purposeValue.toUpperCase();
        let vrfId = null;
        if (entry._vrf !== undefined && entry._vrf !== null && entry._vrf !== '') {
            const parsedVrf = Number(entry._vrf);
            if (Number.isFinite(parsedVrf)) {
                vrfId = Math.max(0, Math.trunc(parsedVrf));
            }
        }
        const isManagement = entry._isManagement === 1 || entry._isManagement === true || entry._isManagement === '1';
        const metrics = computeSnapshotCapacity(key, effectiveMode, children);
        return {
            cidr: key,
            note: typeof entry._note === 'string' ? entry._note : '',
            color: typeof entry._color === 'string' ? entry._color : '',
            ordinal: index,
            name,
            vlanId,
            gatewayIp,
            purpose,
            vrfId,
            isManagement,
            capacityTotal: metrics.total,
            capacityUsed: metrics.used,
            children,
        };
    });
}
function computeSnapshotCapacity(cidr, mode, children) {
    if (typeof cidr !== 'string' || !cidr.includes('/')) {
        return { total: 0, used: 0 };
    }
    const [networkPart, maskPart] = cidr.split('/');
    const netSize = Number(maskPart);
    if (!Number.isFinite(netSize) || netSize < 0 || netSize > 32) {
        return { total: 0, used: 0 };
    }
    const networkInt = ip2int(networkPart);
    if (!Number.isFinite(networkInt)) {
        return { total: 0, used: 0 };
    }
    const normalizedMode = typeof mode === 'string' && mode.length ? mode.toUpperCase() : 'STANDARD';
    const effectiveMode = normalizedMode === 'STANDARD' ? 'Standard' : normalizedMode;
    const usableFirst = subnet_usable_first(networkInt, netSize, effectiveMode);
    const usableLast = subnet_usable_last(networkInt, netSize);
    const total = usableLast >= usableFirst ? (usableLast - usableFirst + 1) : 0;
    const childTotal = Array.isArray(children) ? children.reduce((sum, child) => {
        const value = Number(child && child.capacityTotal);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0) : 0;
    const used = Math.min(total, Math.max(0, childTotal));
    return { total, used };
}
function buildSnapshotFromCurrentState() {
    const tree = mapToSnapshotNodes(subnetMap, operatingMode);
    const networkValue = $('#network').val();
    const sizeValue = $('#netsize').val();
    let baseNetwork = '';
    if (typeof networkValue === 'string' && networkValue && typeof sizeValue === 'string' && sizeValue) {
        baseNetwork = networkValue + '/' + sizeValue;
    } else if (tree.length > 0) {
        baseNetwork = tree[0].cidr;
    }
    return {
        baseNetwork,
        operatingMode,
        tree,
    };
}
function snapshotTreeToMap(nodes) {
    const result = {};
    if (!Array.isArray(nodes)) {
        return result;
    }
    nodes.forEach((node) => {
        if (!node || typeof node.cidr !== 'string' || node.cidr.length === 0) {
            return;
        }
        const branch = snapshotTreeToMap(node.children || []);
        if (node.note) {
            branch._note = node.note;
        }
        if (node.color) {
            branch._color = node.color;
        }
        const name = typeof node.name === 'string' ? node.name.trim() : '';
        if (name) {
            branch._name = name;
        }
        if (node.vlanId !== undefined && node.vlanId !== null && node.vlanId !== '') {
            const parsedVlan = Number(node.vlanId);
            if (Number.isFinite(parsedVlan)) {
                branch._vlan = Math.max(0, Math.trunc(parsedVlan));
            }
        }
        const gateway = typeof node.gatewayIp === 'string' ? node.gatewayIp.trim() : '';
        if (gateway) {
            branch._gateway = gateway;
        }
        const purpose = typeof node.purpose === 'string' && node.purpose.length ? node.purpose : 'LAN';
        branch._purpose = purpose;
        if (node.vrfId !== undefined && node.vrfId !== null && node.vrfId !== '') {
            const parsedVrf = Number(node.vrfId);
            if (Number.isFinite(parsedVrf)) {
                branch._vrf = Math.max(0, Math.trunc(parsedVrf));
            }
        }
        branch._isManagement = node.isManagement ? 1 : 0;
        const capacityTotalValue = Number(node.capacityTotal);
        branch._capacityTotal = Number.isFinite(capacityTotalValue) ? Math.max(0, Math.trunc(capacityTotalValue)) : 0;
        const capacityUsedValue = Number(node.capacityUsed);
        branch._capacityUsed = Number.isFinite(capacityUsedValue) ? Math.max(0, Math.min(branch._capacityTotal, Math.trunc(capacityUsedValue))) : 0;
        result[node.cidr] = branch;
    });
    return sortIPCIDRs(result);
}
function schedulePlannerSnapshotPersist() {
    if (plannerSnapshotPersistPending) {
        return;
    }
    plannerSnapshotPersistPending = true;
    // Show saving indicator
    const savingIndicator = document.querySelector('#db-saving-indicator');
    if (savingIndicator) {
        savingIndicator.style.display = 'inline';
    }
    const run = async () => {
        try {
            await persistPlannerSnapshot();
        } catch (err) {
            console.warn('Planner snapshot scheduling failed', err);
        } finally {
            plannerSnapshotPersistPending = false;
            // Hide saving indicator (also handled by planner-db:saved event)
            if (savingIndicator) {
                savingIndicator.style.display = 'none';
            }
        }
    };
    if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => {
            void run();
        });
    } else {
        setTimeout(() => {
            void run();
        }, 0);
    }
}
async function refreshPlannerViewFromDb(manager) {
    const resolvedManager = manager || window.plannerDbManager;
    refreshPlannerVrfs(resolvedManager);
    if (!resolvedManager || typeof resolvedManager.loadPlannerSnapshot !== 'function' || !resolvedManager.hasDatabase || !resolvedManager.hasDatabase()) {
        return false;
    }
    try {
        const snapshot = await resolvedManager.loadPlannerSnapshot();
        if (snapshot && Array.isArray(snapshot.tree)) {
            return hydratePlannerFromSnapshot(snapshot);
        }
    } catch (err) {
        console.warn('Planner snapshot refresh failed', err);
    }
    return false;
}
async function persistPlannerSnapshot() {
    if (isHydratingFromSnapshot) {
        return;
    }
    let manager = window.plannerDbManager;
    if (!manager) {
        manager = await waitForPlannerDbManager();
    }
    if (!manager || typeof manager.savePlannerSnapshot !== 'function' || !manager.hasDatabase || !manager.hasDatabase()) {
        return;
    }
    const snapshot = buildSnapshotFromCurrentState();
    try {
        await manager.savePlannerSnapshot(snapshot);
        await refreshPlannerViewFromDb(manager);
    } catch (err) {
        console.warn('Planner snapshot save failed', err);
    }
}
function waitForPlannerDbManager(timeoutMs = 2000) {
    if (typeof window !== 'undefined' && window.plannerDbManager) {
        return Promise.resolve(window.plannerDbManager);
    }
    return new Promise((resolve) => {
        const step = 50;
        let elapsed = 0;
        const timer = setInterval(() => {
            if (typeof window !== 'undefined' && window.plannerDbManager) {
                clearInterval(timer);
                resolve(window.plannerDbManager);
                return;
            }
            elapsed += step;
            if (elapsed >= timeoutMs) {
                clearInterval(timer);
                resolve(null);
            }
        }, step);
    });
}
async function bootstrapPlannerFromDb() {
    const manager = await waitForPlannerDbManager();
    if (!manager) {
        return false;
    }
    try {
        if (typeof manager.ensureReady === 'function') {
            await manager.ensureReady();
        }
        refreshPlannerVrfs(manager);
    } catch (err) {
        console.warn('Planner DB ensureReady failed', err);
        return false;
    }
    if (typeof manager.hasDatabase === 'function' && !manager.hasDatabase()) {
        return false;
    }
    try {
        const snapshot = await manager.loadPlannerSnapshot();
        if (!snapshot || !Array.isArray(snapshot.tree) || snapshot.tree.length === 0) {
            return false;
        }
        return hydratePlannerFromSnapshot(snapshot);
    } catch (err) {
        console.warn('Planner DB bootstrap failed', err);
        return false;
    }
}
function hydratePlannerFromSnapshot(snapshot) {
    const tree = Array.isArray(snapshot && snapshot.tree) ? snapshot.tree : [];
    const hasBaseNetwork = snapshot && typeof snapshot.baseNetwork === 'string' && snapshot.baseNetwork.includes('/');
    const baseCandidate = hasBaseNetwork
        ? snapshot.baseNetwork
        : ((tree[0] && typeof tree[0].cidr === 'string') ? tree[0].cidr : '');
    if (!baseCandidate || !baseCandidate.includes('/')) {
        return false;
    }
    const [networkPart, maskPart] = baseCandidate.split('/');
    isHydratingFromSnapshot = true;
    try {
        $('#network').val(networkPart);
        $('#netsize').val(maskPart);
        maxNetSize = parseInt(maskPart, 10);
        subnetMap = snapshotTreeToMap(tree);
        if (typeof window !== 'undefined') {
            window.subnetMap = subnetMap;
        }
        const hasOperatingMode = snapshot && typeof snapshot.operatingMode === 'string' && snapshot.operatingMode.length;
        const nextMode = hasOperatingMode ? snapshot.operatingMode : 'Standard';
        operatingMode = nextMode;
        previousOperatingMode = nextMode;
        const switched = switchMode(operatingMode);
        if (!switched) {
            renderTable(operatingMode);
        }
        return true;
    } finally {
        isHydratingFromSnapshot = false;
    }
}
if (typeof window !== 'undefined') {
    window.waitForPlannerDbManager = waitForPlannerDbManager;
    window.bootstrapPlannerFromDb = bootstrapPlannerFromDb;
    window.persistPlannerSnapshot = persistPlannerSnapshot;
    window.refreshPlannerViewFromDb = refreshPlannerViewFromDb;
    window.hydratePlannerFromSnapshot = hydratePlannerFromSnapshot;
    window.addEventListener('planner-db:opened', () => {
        bootstrapPlannerFromDb().catch((err) => {
            console.warn('Planner snapshot hydration failed', err);
        });
    });
    waitForPlannerDbManager().then((manager) => {
        if (manager && typeof manager.hasDatabase === 'function' && manager.hasDatabase()) {
            return bootstrapPlannerFromDb();
        }
        return false;
    }).catch((err) => {
        console.warn('Planner DB manager wait failed', err);
    });
}
function sortIPCIDRs(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Object.keys(obj).length === 0) {
    return {};
  }
  // Separate CIDR entries from metadata
  const entries = Object.entries(obj);
  const cidrEntries = entries.filter(([key]) => !key.startsWith('_'));
  const metadataEntries = entries.filter(([key]) => key.startsWith('_'));
  // Sort CIDR entries by IP address
  const sortedCIDREntries = cidrEntries.sort((a, b) => {
    const ipA = a[0].split('/')[0].split('.').map(Number);
    const ipB = b[0].split('/')[0].split('.').map(Number);
    for (let i = 0; i < 4; i++) {
      if (ipA[i] !== ipB[i]) {
        return ipA[i] - ipB[i];
      }
    }
    return 0;
  });
  // Create sorted object, starting with metadata
  const sortedObj = {};
  // Add sorted CIDR entries with recursion
  for (const [key, value] of sortedCIDREntries) {
    sortedObj[key] = typeof value === 'object' ? sortIPCIDRs(value) : value;
  }
  // Add metadata entries (unsorted, as they appeared in original)
  for (const [key, value] of metadataEntries) {
    sortedObj[key] = value;
  }
  return sortedObj;
}
const rgba2hex = (rgba) => `#${rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+\.{0,1}\d*))?\)$/).slice(1).map((n, i) => (i === 3 ? Math.round(parseFloat(n) * 255) : parseFloat(n)).toString(16).padStart(2, '0').replace('NaN', '')).join('')}`
$('#calcbody').on('change', '.subnet-name-input', function () {
    const cidr = this.dataset.subnet;
    if (!cidr) {
        return;
    }
    const entry = getSubnetEntry(cidr);
    if (!entry) {
        return;
    }
    const value = typeof this.value === 'string' ? this.value.trim() : '';
    const existing = typeof entry._name === 'string' ? entry._name : '';
    if (existing === value) {
        return;
    }
    if (value) {
        entry._name = value;
    } else {
        delete entry._name;
    }
    schedulePlannerSnapshotPersist();
});

$('#calcbody').on('change', '.subnet-vlan-input', function () {
    const cidr = this.dataset.subnet;
    if (!cidr) {
        return;
    }
    const entry = getSubnetEntry(cidr);
    if (!entry) {
        return;
    }
    const previous = entry._vlan !== undefined && entry._vlan !== null && entry._vlan !== '' ? Math.max(0, Math.trunc(Number(entry._vlan))) : '';
    const rawValue = typeof this.value === 'string' ? this.value.trim() : '';
    if (rawValue === '') {
        if (previous === '') {
            return;
        }
        delete entry._vlan;
        this.value = '';
        schedulePlannerSnapshotPersist();
        return;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 4094) {
        show_warning_modal('<div>VLAN IDs must be between 0 and 4094.</div>');
        this.value = previous === '' ? '' : previous;
        return;
    }
    const vlanId = Math.max(0, Math.trunc(parsed));
    if (!isVlanAvailableForCidr(vlanId, cidr)) {
        show_warning_modal('<div>VLAN ' + vlanId + ' is already in use on another subnet.</div>');
        this.value = previous === '' ? '' : previous;
        return;
    }
    if (previous === vlanId) {
        this.value = vlanId;
        return;
    }
    entry._vlan = vlanId;
    this.value = vlanId;
    schedulePlannerSnapshotPersist();
});

$('#calcbody').on('change', '.subnet-purpose-select', function () {
    const cidr = this.dataset.subnet;
    if (!cidr) {
        return;
    }
    const entry = getSubnetEntry(cidr);
    if (!entry) {
        return;
    }
    const previous = typeof entry._purpose === 'string' && entry._purpose.length ? entry._purpose.toUpperCase() : 'LAN';
    const selected = typeof this.value === 'string' ? this.value.toUpperCase() : 'LAN';
    if (selected === 'INTERCONNECT') {
        const netSize = Number(cidr.split('/')[1]);
        if (netSize !== 30 && netSize !== 31) {
            show_warning_modal('<div>Interconnect subnets must be /30 or /31.</div>');
            this.value = previous;
            return;
        }
    }
    if (previous === selected) {
        this.value = selected;
        return;
    }
    entry._purpose = selected;
    schedulePlannerSnapshotPersist();
});

$('#calcbody').on('change', '.subnet-vrf-select', function () {
    const cidr = this.dataset.subnet;
    if (!cidr) {
        return;
    }
    const entry = getSubnetEntry(cidr);
    if (!entry) {
        return;
    }
    const previous = entry._vrf !== undefined && entry._vrf !== null && entry._vrf !== '' ? Math.max(0, Math.trunc(Number(entry._vrf))) : null;
    const rawValue = typeof this.value === 'string' ? this.value.trim() : '';
    if (rawValue === '') {
        if (previous === null) {
            return;
        }
        delete entry._vrf;
        schedulePlannerSnapshotPersist();
        return;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
        show_warning_modal('<div>Invalid VRF selection.</div>');
        this.value = previous === null ? '' : previous;
        return;
    }
    const vrfId = Math.max(0, Math.trunc(parsed));
    if (previous === vrfId) {
        this.value = vrfId;
        return;
    }
    entry._vrf = vrfId;
    schedulePlannerSnapshotPersist();
});

$('#calcbody').on('change', '.subnet-gateway-input', function () {
    const cidr = this.dataset.subnet;
    if (!cidr) {
        return;
    }
    const entry = getSubnetEntry(cidr);
    if (!entry) {
        return;
    }
    const previous = typeof entry._gateway === 'string' ? entry._gateway : '';
    const value = typeof this.value === 'string' ? this.value.trim() : '';
    if (value === '') {
        if (!previous) {
            return;
        }
        delete entry._gateway;
        this.value = '';
        schedulePlannerSnapshotPersist();
        return;
    }
    if (!isValidIpv4(value)) {
        show_warning_modal('<div>Gateway must be a valid IPv4 address.</div>');
        this.value = previous;
        return;
    }
    if (!isGatewayValidForSubnet(cidr, value, operatingMode)) {
        show_warning_modal('<div>Gateway must fall within the usable range for ' + cidr + '.</div>');
        this.value = previous;
        return;
    }
    if (previous === value) {
        this.value = value;
        return;
    }
    entry._gateway = value;
    this.value = value;
    schedulePlannerSnapshotPersist();
});

$('#calcbody').on('change', '.subnet-management-checkbox', function () {
    const cidr = this.dataset.subnet;
    if (!cidr) {
        return;
    }
    const entry = getSubnetEntry(cidr);
    if (!entry) {
        return;
    }
    const value = this.checked ? 1 : 0;
    if (entry._isManagement === value) {
        return;
    }
    entry._isManagement = value;
    schedulePlannerSnapshotPersist();
});



