# 图元对齐示例工程

![Blazor WASM](https://img.shields.io/badge/Blazor-WebAssembly-blueviolet)
![.NET](https://img.shields.io/badge/.NET-6.0%2B-blue)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![EN](https://img.shields.io/badge/Language-English-blue)](README.en-US.md)
[![CN](https://img.shields.io/badge/语言-中文-red)](README.md)

## 接口定义

```csharp
public interface IAlignable
{
    /// <summary>
    /// 获取世界坐标系下的轴对齐包围盒
    /// </summary>
    Box GetWorldBoundingBox();

    /// <summary>
    /// 获取图形的世界变换矩阵
    /// </summary>
    Transform GetWorldTransform();

    /// <summary>
    /// 设置图形的世界变换矩阵
    /// </summary>
    void SetWorldTransform(Transform transform);
}
```

## 包围盒计算

<img src="alignment.png" />

## 对齐算法

1. 获取所有图元的世界包围盒；
2. 计算所有包围盒的并集，得到整体包围盒；
3. 根据整体包围盒的属性（如MinX, MinY, MaxX, MaxY, CenterX, CenterY）计算对齐位置；

```csharp
private static (float dx, float dy) CalculateOffset(Box box, AlignType type, Box referenceBox)
{
    return type switch
    {
        AlignType.Left => (referenceBox.MinX - box.MinX, 0),
        AlignType.HCenter => (referenceBox.CenterX - box.CenterX, 0),
        AlignType.Right => (referenceBox.MaxX - box.MaxX, 0),
        AlignType.Top => (0, referenceBox.MaxY - box.MaxY),
        AlignType.VCenter => (0, referenceBox.CenterY - box.CenterY),
        AlignType.Bottom => (0, referenceBox.MinY - box.MinY),
        _ => throw new ArgumentException("无效的对齐类型", nameof(type)),
    };
}
```
